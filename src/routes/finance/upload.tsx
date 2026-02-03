import {
	CircleNotchIcon,
	FileTextIcon,
	PlusIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CONFIDENCE_THRESHOLDS } from "@/lib/categorize";
import { formatCents } from "@/lib/date-utils";
import type { ParsedTransaction } from "@/lib/pdf-parser";
import {
	type CreateAccountInput,
	createAccount,
	getAccounts,
} from "@/lib/server/accounts";
import {
	type CreateCategoryRuleInput,
	createCategoryRule,
	getCategories,
} from "@/lib/server/categories";
import {
	importTransactions,
	type PreparedTransaction,
	type PrepareImportInput,
	prepareImport,
} from "@/lib/server/prepare-import";
import { uploadFile } from "@/lib/server/upload-file";

const MAX_PDF_FILES = 10;

type UploadResult = {
	bank: "bofa" | "capital_one" | "unknown" | "mixed";
	transactions: ParsedTransaction[];
	needsReview: ParsedTransaction[];
};

type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

function FinanceUploadPage() {
	const [files, setFiles] = useState<File[]>([]);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<UploadResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const [accountId, setAccountId] = useState<string | null>(null);
	const [accountsList, setAccountsList] = useState<AccountRow[]>([]);
	const [showNewAccountForm, setShowNewAccountForm] = useState(false);
	const [newAccountName, setNewAccountName] = useState("");
	const [newAccountInstitution, setNewAccountInstitution] = useState("bofa");
	const [newAccountType, setNewAccountType] = useState("checking");
	const [newAccountMask, setNewAccountMask] = useState("");
	const [creatingAccount, setCreatingAccount] = useState(false);
	const [preparedList, setPreparedList] = useState<
		PreparedTransaction[] | null
	>(null);
	const [loadingPrepare, setLoadingPrepare] = useState(false);
	const [importSuccess, setImportSuccess] = useState<{
		imported: number;
	} | null>(null);
	const [loadingImport, setLoadingImport] = useState(false);
	const [categoriesList, setCategoriesList] = useState<
		{ id: string; name: string }[]
	>([]);
	const [categoryOverrides, setCategoryOverrides] = useState<
		Record<string, string>
	>({});
	const [createRuleFor, setCreateRuleFor] = useState<string | null>(null);
	const [createRulePattern, setCreateRulePattern] = useState("");
	const [createRuleCategoryId, setCreateRuleCategoryId] = useState("");
	const [createRuleMatchType, setCreateRuleMatchType] = useState<
		"contains" | "starts_with" | "exact"
	>("contains");
	const [creatingRule, setCreatingRule] = useState(false);
	const [saveRuleFor, setSaveRuleFor] = useState<Record<string, boolean>>({});
	const fileInputId = useId();
	const accountFormId = useId();

	useEffect(() => {
		if (result) getAccounts().then(setAccountsList);
	}, [result]);

	useEffect(() => {
		if (preparedList?.length) getCategories().then(setCategoriesList);
	}, [preparedList?.length]);

	useEffect(() => {
		if (!preparedList?.length) return;
		const initial: Record<string, boolean> = {};
		for (const tx of preparedList) {
			if (tx.source === "llm" && tx.suggestedMatchPattern != null) {
				initial[`${tx.date}-${tx.description}-${tx.amountCents}`] =
					tx.likelyRecurring ?? false;
			}
		}
		if (Object.keys(initial).length) setSaveRuleFor(initial);
	}, [preparedList]);

	const onDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const dropped = Array.from(e.dataTransfer.files).filter(
			(f) =>
				f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
		);
		if (dropped.length === 0) {
			setError("Please drop PDF file(s).");
			return;
		}
		setFiles((prev) => {
			const combined = [...prev, ...dropped];
			return combined.slice(0, MAX_PDF_FILES);
		});
		setResult(null);
		setError(null);
	}, []);

	const onDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const onDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
	}, []);

	const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selected = e.target.files;
		if (!selected?.length) return;
		const pdfs = Array.from(selected).filter(
			(f) =>
				f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
		);
		setFiles((prev) => {
			const combined = [...prev, ...pdfs];
			return combined.slice(0, MAX_PDF_FILES);
		});
		setResult(null);
		setError(null);
		e.target.value = "";
	};

	const upload = async () => {
		if (files.length === 0) return;
		setLoading(true);
		setError(null);
		setAccountId(null);
		setPreparedList(null);
		setImportSuccess(null);
		setCategoryOverrides({});
		setCreateRuleFor(null);
		setSaveRuleFor({});
		try {
			const formData = new FormData();
			for (const f of files) {
				formData.append("files[]", f);
			}
			const data = await uploadFile({ data: formData });
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

	const handleNewAccountClick = () => {
		setShowNewAccountForm(true);
		if (result) setNewAccountInstitution(result.bank);
	};

	const handleCreateAccount = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!newAccountName.trim()) return;
		setCreatingAccount(true);
		setError(null);
		try {
			const payload: CreateAccountInput = {
				name: newAccountName.trim(),
				institution: newAccountInstitution,
				accountType: newAccountType,
				mask: newAccountMask.trim() || undefined,
			};
			const account = await createAccount({ data: { data: payload } });
			setAccountId(account.id);
			setShowNewAccountForm(false);
			setNewAccountName("");
			setNewAccountMask("");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setCreatingAccount(false);
		}
	};

	const handleContinueToReview = async () => {
		if (!result || !accountId) return;
		setLoadingPrepare(true);
		setError(null);
		try {
			const payload: PrepareImportInput = {
				accountId,
				parsedTransactions: result.transactions,
			};
			const list = await prepareImport({ data: payload });
			setPreparedList(list);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoadingPrepare(false);
		}
	};

	const autoTxs =
		preparedList?.filter(
			(t) => t.confidence >= CONFIDENCE_THRESHOLDS.AUTO_ACCEPT,
		) ?? [];
	const suggestTxs =
		preparedList?.filter(
			(t) =>
				t.confidence >= CONFIDENCE_THRESHOLDS.SUGGEST &&
				t.confidence < CONFIDENCE_THRESHOLDS.AUTO_ACCEPT,
		) ?? [];
	const manualTxs =
		preparedList?.filter((t) => t.confidence < CONFIDENCE_THRESHOLDS.SUGGEST) ??
		[];

	const NO_CATEGORY_VALUE = "__none__";

	function txKey(tx: PreparedTransaction): string {
		return `${tx.date}-${tx.description}-${tx.amountCents}`;
	}

	const handleImport = async () => {
		if (!preparedList || !accountId) return;
		setLoadingImport(true);
		setError(null);
		try {
			for (const tx of preparedList) {
				const key = txKey(tx);
				if (!(saveRuleFor[key] ?? false) || !tx.suggestedMatchPattern?.trim())
					continue;
				const categoryId = categoryOverrides[key] ?? tx.categoryId ?? null;
				if (!categoryId) continue;
				await createCategoryRule({
					data: {
						data: {
							categoryId,
							matchPattern: tx.suggestedMatchPattern.trim(),
							matchField: "name",
							matchType: "contains",
						},
					},
				});
			}
			const merged = preparedList.map((tx) => ({
				...tx,
				categoryId: (categoryOverrides[txKey(tx)] ?? tx.categoryId) || null,
			}));
			const result = await importTransactions({
				data: {
					accountId,
					transactions: merged,
				},
			});
			setImportSuccess(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoadingImport(false);
		}
	};

	const selectedAccount = accountsList.find((a) => a.id === accountId);

	if (preparedList) {
		return (
			<div className="p-6 font-mono w-full max-w-7xl mx-auto">
				{error && <p className="text-sm text-destructive mb-4">{error}</p>}
				<div className="flex flex-wrap items-center gap-2 mb-4">
					<span className="text-sm text-muted-foreground">
						Account:{" "}
						{selectedAccount
							? `${selectedAccount.name} (${selectedAccount.institution} · ${selectedAccount.accountType})`
							: accountId}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setPreparedList(null)}
					>
						Change account
					</Button>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-sm mb-4">
					{autoTxs.length > 0 && (
						<Badge variant="secondary">{autoTxs.length} auto-categorized</Badge>
					)}
					{suggestTxs.length > 0 && (
						<Badge variant="outline">{suggestTxs.length} suggested</Badge>
					)}
					{manualTxs.length > 0 && (
						<Badge variant="destructive">{manualTxs.length} need review</Badge>
					)}
				</div>
				<div className="rounded border overflow-hidden max-h-[70vh] overflow-y-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="font-mono text-xs">Date</TableHead>
								<TableHead className="min-w-[280px]">Description</TableHead>
								<TableHead className="text-right">Amount</TableHead>
								<TableHead>Category</TableHead>
								<TableHead className="w-[80px] text-center">
									Save rule
								</TableHead>
								<TableHead className="w-[100px]"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{preparedList.map((tx) => {
								const key = txKey(tx);
								const rawValue = categoryOverrides[key] ?? tx.categoryId ?? "";
								const selectValue = rawValue || NO_CATEGORY_VALUE;
								return (
									<TableRow key={tx.externalId ?? key}>
										<TableCell className="font-mono text-xs whitespace-nowrap">
											{tx.date}
										</TableCell>
										<TableCell className="min-w-[280px] font-mono text-xs whitespace-normal">
											{tx.description}
										</TableCell>
										<TableCell className="text-right tabular-nums whitespace-nowrap">
											{formatCents(
												tx.type === "credit" ? tx.amountCents : -tx.amountCents,
											)}
										</TableCell>
										<TableCell>
											<Select
												value={selectValue}
												onValueChange={(v) =>
													setCategoryOverrides((prev) => ({
														...prev,
														[key]: v === NO_CATEGORY_VALUE ? "" : v,
													}))
												}
											>
												<SelectTrigger className="h-8 text-xs w-[140px]">
													<SelectValue placeholder="—" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={NO_CATEGORY_VALUE}>—</SelectItem>
													{categoriesList.map((c) => (
														<SelectItem key={c.id} value={c.id}>
															{c.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</TableCell>
										<TableCell className="text-center">
											{tx.source === "llm" &&
											tx.suggestedMatchPattern != null ? (
												<label className="flex items-center justify-center gap-1 text-xs cursor-pointer">
													<input
														type="checkbox"
														checked={saveRuleFor[key] ?? false}
														onChange={() =>
															setSaveRuleFor((prev) => ({
																...prev,
																[key]: !(prev[key] ?? false),
															}))
														}
														className="rounded border-input"
													/>
													Save rule
												</label>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="sm"
												className="text-xs"
												onClick={() => {
													setCreateRuleFor(key);
													setCreateRulePattern(
														tx.suggestedMatchPattern?.trim() ||
															tx.description.slice(0, 40),
													);
													setCreateRuleCategoryId(rawValue || "");
													setCreateRuleMatchType("contains");
												}}
											>
												Create rule
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
				{createRuleFor && (
					<Card className="mt-4 p-4">
						<Label className="text-xs font-medium">Create category rule</Label>
						<form
							className="mt-2 space-y-2 max-w-md"
							onSubmit={async (e) => {
								e.preventDefault();
								if (!createRulePattern.trim() || !createRuleCategoryId) return;
								setCreatingRule(true);
								setError(null);
								try {
									const payload: CreateCategoryRuleInput = {
										categoryId: createRuleCategoryId,
										matchPattern: createRulePattern.trim(),
										matchField: "name",
										matchType: createRuleMatchType,
									};
									await createCategoryRule({
										data: { data: payload },
									});
									setCategoryOverrides((prev) => ({
										...prev,
										[createRuleFor]: createRuleCategoryId,
									}));
									setCreateRuleFor(null);
								} catch (err) {
									setError(err instanceof Error ? err.message : String(err));
								} finally {
									setCreatingRule(false);
								}
							}}
						>
							<div>
								<Label
									htmlFor={`${accountFormId}-rule-pattern`}
									className="text-xs"
								>
									Pattern (matches transaction name)
								</Label>
								<Input
									id={`${accountFormId}-rule-pattern`}
									value={createRulePattern}
									onChange={(e) => setCreateRulePattern(e.target.value)}
									className="mt-1 h-8 text-xs"
								/>
							</div>
							<div>
								<Label
									htmlFor={`${accountFormId}-rule-cat`}
									className="text-xs"
								>
									Category
								</Label>
								<Select
									value={createRuleCategoryId}
									onValueChange={setCreateRuleCategoryId}
								>
									<SelectTrigger
										id={`${accountFormId}-rule-cat`}
										className="mt-1 h-8 text-xs w-full"
									>
										<SelectValue placeholder="Select" />
									</SelectTrigger>
									<SelectContent>
										{categoriesList.map((c) => (
											<SelectItem key={c.id} value={c.id}>
												{c.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div>
								<Label
									htmlFor={`${accountFormId}-rule-type`}
									className="text-xs"
								>
									Match type
								</Label>
								<Select
									value={createRuleMatchType}
									onValueChange={(v) =>
										setCreateRuleMatchType(
											v as "contains" | "starts_with" | "exact",
										)
									}
								>
									<SelectTrigger
										id={`${accountFormId}-rule-type`}
										className="mt-1 h-8 text-xs w-full"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="contains">Contains</SelectItem>
										<SelectItem value="starts_with">Starts with</SelectItem>
										<SelectItem value="exact">Exact</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="flex gap-2 pt-2">
								<Button type="submit" size="sm" disabled={creatingRule}>
									{creatingRule ? (
										<CircleNotchIcon className="h-4 w-4 animate-spin" />
									) : (
										"Create rule"
									)}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setCreateRuleFor(null)}
								>
									Cancel
								</Button>
							</div>
						</form>
					</Card>
				)}
				{!importSuccess && (
					<div className="mt-4">
						<Button
							onClick={handleImport}
							disabled={loadingImport}
							className="w-full"
						>
							{loadingImport ? (
								<>
									<CircleNotchIcon className="h-4 w-4 mr-2 animate-spin" />
									Importing…
								</>
							) : (
								`Import ${preparedList.length} transactions`
							)}
						</Button>
					</div>
				)}
				{importSuccess && (
					<section className="mt-4 space-y-3" aria-label="Import complete">
						<p className="text-sm font-medium">
							Imported {importSuccess.imported} transactions.
						</p>
						<div className="flex flex-wrap gap-2">
							<Button asChild variant="default" size="sm">
								<Link to="/dashboard">Dashboard</Link>
							</Button>
							<Button asChild variant="outline" size="sm">
								<Link to="/finance/chat">Finance chat</Link>
							</Button>
						</div>
					</section>
				)}
			</div>
		);
	}

	return (
		<div className="p-6 font-mono max-w-3xl mx-auto">
			<Card>
				<CardHeader>
					<CardTitle>Upload Statement</CardTitle>
					<CardDescription>
						PDF from Bank of America or Capital One. We extract transactions
						locally.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<section
						aria-label="PDF drop zone"
						onDrop={onDrop}
						onDragOver={onDragOver}
						onDragLeave={onDragLeave}
						className={`border-2 border-dashed rounded-none p-12 text-center transition-colors ${
							dragOver
								? "border-primary bg-muted/50"
								: "border-muted-foreground/25"
						}`}
					>
						{files.length > 0 ? (
							<div className="flex flex-col items-center gap-2 text-sm">
								<ul className="list-none space-y-1 max-h-32 overflow-y-auto w-full max-w-md">
									{files.map((f, i) => (
										<li
											key={`${f.name}-${i}`}
											className="flex items-center justify-between gap-2"
										>
											<FileTextIcon className="h-4 w-4 shrink-0" />
											<span className="truncate">{f.name}</span>
											<Button
												variant="ghost"
												size="sm"
												className="shrink-0"
												onClick={() => {
													setFiles((prev) => prev.filter((_, j) => j !== i));
													setResult(null);
												}}
											>
												Remove
											</Button>
										</li>
									))}
								</ul>
								{files.length >= MAX_PDF_FILES && (
									<p className="text-muted-foreground text-xs">
										Max {MAX_PDF_FILES} files
									</p>
								)}
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setFiles([]);
										setResult(null);
									}}
								>
									Clear all
								</Button>
							</div>
						) : (
							<>
								<p className="text-muted-foreground mb-2">
									Drag and drop PDFs here (up to {MAX_PDF_FILES})
								</p>
								<input
									type="file"
									accept=".pdf,application/pdf"
									multiple
									onChange={onFileChange}
									className="hidden"
									id={fileInputId}
									aria-label="Choose PDF files"
								/>
								<Button
									variant="outline"
									type="button"
									onClick={() => document.getElementById(fileInputId)?.click()}
								>
									<UploadSimpleIcon className="h-4 w-4 mr-2" />
									Choose files
								</Button>
							</>
						)}
					</section>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{files.length > 0 && (
						<Button onClick={upload} disabled={loading} className="w-full">
							{loading ? (
								<>
									<CircleNotchIcon className="h-4 w-4 mr-2 animate-spin" />
									Parsing…
								</>
							) : (
								"Parse PDF"
							)}
						</Button>
					)}
					{loading && <Progress value={50} className="w-full" />}
					{result && (
						<div className="space-y-4 pt-4 border-t">
							<div className="flex items-center gap-2">
								<Badge>{result.bank}</Badge>
								<span className="text-sm text-muted-foreground">
									{result.transactions.length} transactions
									{result.needsReview.length > 0 &&
										`, ${result.needsReview.length} need review`}
								</span>
							</div>
							<div className="max-h-60 overflow-y-auto rounded border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Date</TableHead>
											<TableHead>Description</TableHead>
											<TableHead className="text-right">Amount</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{result.transactions.slice(0, 50).map((tx, i) => (
											<TableRow key={tx.externalId ?? i}>
												<TableCell className="font-mono text-xs">
													{tx.date}
												</TableCell>
												<TableCell className="truncate max-w-[200px]">
													{tx.description}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatCents(
														tx.type === "credit"
															? tx.amountCents
															: -tx.amountCents,
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
								{result.transactions.length > 50 && (
									<p className="p-2 text-muted-foreground text-xs">
										… and {result.transactions.length - 50} more
									</p>
								)}
							</div>
							<section
								className="space-y-3 border-t pt-4"
								aria-label="Assign to account"
							>
								<Label>Account</Label>
								{!showNewAccountForm ? (
									<div className="flex flex-wrap items-center gap-2">
										<Select
											value={accountId ?? ""}
											onValueChange={(v) => {
												setAccountId(v || null);
												setPreparedList(null);
											}}
										>
											<SelectTrigger className="w-[280px]">
												<SelectValue placeholder="Select account" />
											</SelectTrigger>
											<SelectContent position="popper" className="z-100">
												{accountsList.length === 0 ? (
													<SelectGroup>
														<SelectLabel className="text-muted-foreground">
															No accounts yet. Create one below.
														</SelectLabel>
													</SelectGroup>
												) : (
													accountsList.map((a) => (
														<SelectItem key={a.id} value={a.id}>
															{a.name} ({a.institution} · {a.accountType})
															{a.mask ? ` · *${a.mask}` : ""}
														</SelectItem>
													))
												)}
											</SelectContent>
										</Select>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleNewAccountClick}
										>
											<PlusIcon className="h-4 w-4 mr-1" />
											New account
										</Button>
									</div>
								) : (
									<form
										onSubmit={handleCreateAccount}
										className="space-y-3 max-w-sm"
									>
										<div>
											<Label htmlFor={`${accountFormId}-name`}>Name</Label>
											<Input
												id={`${accountFormId}-name`}
												value={newAccountName}
												onChange={(e) => setNewAccountName(e.target.value)}
												placeholder="e.g. BoA Checking"
												required
											/>
										</div>
										<div>
											<Label htmlFor={`${accountFormId}-institution`}>
												Institution
											</Label>
											<Select
												value={newAccountInstitution}
												onValueChange={setNewAccountInstitution}
											>
												<SelectTrigger
													id={`${accountFormId}-institution`}
													className="w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="bofa">Bank of America</SelectItem>
													<SelectItem value="capital_one">
														Capital One
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label htmlFor={`${accountFormId}-type`}>
												Account type
											</Label>
											<Select
												value={newAccountType}
												onValueChange={setNewAccountType}
											>
												<SelectTrigger
													id={`${accountFormId}-type`}
													className="w-full"
												>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="checking">Checking</SelectItem>
													<SelectItem value="credit_card">
														Credit card
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div>
											<Label htmlFor={`${accountFormId}-mask`}>
												Last 4 digits (optional)
											</Label>
											<Input
												id={`${accountFormId}-mask`}
												value={newAccountMask}
												onChange={(e) => setNewAccountMask(e.target.value)}
												placeholder="1234"
												maxLength={4}
											/>
										</div>
										<div className="flex gap-2">
											<Button type="submit" disabled={creatingAccount}>
												{creatingAccount ? (
													<>
														<CircleNotchIcon className="h-4 w-4 mr-2 animate-spin" />
														Creating…
													</>
												) : (
													"Create account"
												)}
											</Button>
											<Button
												type="button"
												variant="ghost"
												onClick={() => setShowNewAccountForm(false)}
											>
												Cancel
											</Button>
										</div>
									</form>
								)}
							</section>
							{accountId && result && !showNewAccountForm && (
								<div className="border-t pt-4">
									<Button
										onClick={handleContinueToReview}
										disabled={loadingPrepare}
										className="w-full"
									>
										{loadingPrepare ? (
											<>
												<CircleNotchIcon className="h-4 w-4 mr-2 animate-spin" />
												Categorizing…
											</>
										) : (
											"Continue to review"
										)}
									</Button>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export const Route = createFileRoute("/finance/upload")({
	component: FinanceUploadPage,
});
