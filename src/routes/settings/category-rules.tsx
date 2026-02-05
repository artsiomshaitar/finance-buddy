import { ArrowRight, Info, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	createCategoryRule,
	deleteCategoryRule as deleteCategoryRuleFn,
	getCategoriesForSettings,
	getCategoryRulesForSettings,
	type UpdateCategoryRuleInput,
	updateCategoryRule as updateCategoryRuleFn,
} from "@/lib/server/categories";

export const Route = createFileRoute("/settings/category-rules")({
	component: SettingsCategoryRulesPage,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData({
			queryKey: ["category-rules-for-settings"],
			queryFn: () => getCategoryRulesForSettings(),
		});
		await context.queryClient.ensureQueryData({
			queryKey: ["categories-for-settings"],
			queryFn: () => getCategoriesForSettings(),
		});
	},
});

type RuleRow = Awaited<ReturnType<typeof getCategoryRulesForSettings>>[number];

function SettingsCategoryRulesPage() {
	const queryClient = useQueryClient();
	const { data: serverData = [] } = useQuery({
		queryKey: ["category-rules-for-settings"],
		queryFn: () => getCategoryRulesForSettings(),
	});
	const { data: categories = [] } = useQuery({
		queryKey: ["categories-for-settings"],
		queryFn: () => getCategoriesForSettings(),
	});
	const [editRows, setEditRows] = useState<RuleRow[]>([]);
	const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	useEffect(() => {
		if (serverData.length >= 0 && dirtyIds.size === 0) {
			setEditRows([...serverData]);
		}
	}, [serverData, dirtyIds.size]);

	const updateCategoryRule = useServerFn(updateCategoryRuleFn);
	const createRule = useServerFn(createCategoryRule);
	const deleteCategoryRule = useServerFn(deleteCategoryRuleFn);

	const updateRow = (id: string, patch: Partial<RuleRow>) => {
		setEditRows((prev) =>
			prev.map((r) => {
				if (r.id !== id) return r;
				const next = { ...r, ...patch };
				if (patch.categoryId !== undefined) {
					const cat = categories.find((c) => c.id === patch.categoryId);
					if (cat) {
						next.categoryName = cat.name;
						next.categoryIcon = cat.icon ?? null;
					}
				}
				return next;
			}),
		);
		setDirtyIds((prev) => new Set(prev).add(id));
	};

	const addRow = () => {
		const firstCategory = categories[0];
		const categoryId = firstCategory?.id ?? "";
		const cat = categories.find((c) => c.id === categoryId);
		const newId = `new-${crypto.randomUUID()}`;
		const newRow: RuleRow = {
			id: newId,
			categoryId,
			categoryName: cat?.name ?? "",
			categoryIcon: cat?.icon ?? null,
			matchField: "name",
			matchType: "contains",
			matchPattern: "",
			priority: 0,
			isEnabled: true,
		};
		setEditRows((prev) => [...prev, newRow]);
		setDirtyIds((prev) => new Set(prev).add(newId));
	};

	const saveMutation = useMutation({
		mutationFn: async () => {
			const dirtyList = Array.from(dirtyIds);
			for (const id of dirtyList) {
				const row = editRows.find((r) => r.id === id);
				if (!row) continue;
				if (id.startsWith("new-")) {
					const pattern = row.matchPattern?.trim();
					if (!pattern) continue;
					await createRule({
						data: {
							categoryId: row.categoryId,
							matchPattern: pattern,
							matchField: row.matchField ?? "name",
							matchType: row.matchType ?? "contains",
							priority: row.priority ?? 0,
							isEnabled: row.isEnabled ?? true,
						},
					});
				} else {
					const original = serverData.find((r) => r.id === id);
					if (!original) continue;
					const patch: UpdateCategoryRuleInput = { id };
					if (row.categoryId !== original.categoryId)
						patch.categoryId = row.categoryId;
					if (row.matchField !== original.matchField)
						patch.matchField = row.matchField ?? "name";
					if (row.matchType !== original.matchType)
						patch.matchType = row.matchType ?? "contains";
					if (row.matchPattern !== original.matchPattern)
						patch.matchPattern = row.matchPattern;
					if (row.priority !== original.priority)
						patch.priority = row.priority ?? 0;
					if (row.isEnabled !== original.isEnabled)
						patch.isEnabled = row.isEnabled ?? true;
					if (Object.keys(patch).length === 1) continue;
					await updateCategoryRule({ data: patch });
				}
			}
		},
		onSuccess: () => {
			setDirtyIds(new Set());
			queryClient.invalidateQueries({
				queryKey: ["category-rules-for-settings"],
			});
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteCategoryRule({ data: { id } }),
		onSuccess: (_, id) => {
			setEditRows((prev) => prev.filter((r) => r.id !== id));
			setDirtyIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			queryClient.invalidateQueries({
				queryKey: ["category-rules-for-settings"],
			});
		},
	});

	const removeRow = (id: string) => {
		if (id.startsWith("new-")) {
			setEditRows((prev) => prev.filter((r) => r.id !== id));
			setDirtyIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		} else {
			deleteMutation.mutate(id);
		}
	};

	const isDirty = dirtyIds.size > 0;
	const rows = editRows.length > 0 ? editRows : serverData;
	const hasNewWithEmptyPattern = rows.some(
		(r) => r.id.startsWith("new-") && !r.matchPattern?.trim(),
	);

	const confirmDelete = () => {
		if (deleteConfirmId) {
			removeRow(deleteConfirmId);
			setDeleteConfirmId(null);
		}
	};

	return (
		<TooltipProvider>
			<AlertDialog
				open={deleteConfirmId !== null}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete rule?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove this category rule. This action
							cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={confirmDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<div className="max-w-7xl mx-auto">
				<div className="overflow-x-auto border border-border">
					<Table className="table-auto">
						<TableHeader>
							<TableRow>
								<TableHead className="text-center px-4">Enabled</TableHead>
								<TableHead className="">
									<span className="inline-flex items-center gap-1">
										Match type
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													aria-label="Explanation for Match type"
												>
													<Info size={14} weight="regular" />
												</button>
											</TooltipTrigger>
											<TooltipContent>
												How the pattern is applied (e.g. Contains matches
												anywhere in the text).
											</TooltipContent>
										</Tooltip>
									</span>
								</TableHead>
								<TableHead className="w-full">
									<span className="inline-flex items-center gap-1">
										Pattern
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													aria-label="Explanation for Pattern"
												>
													<Info size={14} weight="regular" />
												</button>
											</TooltipTrigger>
											<TooltipContent>
												Text to match; matching is case-insensitive.
											</TooltipContent>
										</Tooltip>
									</span>
								</TableHead>
								<TableHead className="" />
								<TableHead className="">
									<span className="inline-flex items-center gap-1">
										Category
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													aria-label="Explanation for Category"
												>
													<Info size={14} weight="regular" />
												</button>
											</TooltipTrigger>
											<TooltipContent>
												Category assigned when this rule matches a transaction.
											</TooltipContent>
										</Tooltip>
									</span>
								</TableHead>
								<TableHead className="" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="px-2">
										<div className="flex justify-center items-center">
											<Checkbox
												checked={row.isEnabled ?? true}
												onCheckedChange={(checked) =>
													updateRow(row.id, { isEnabled: checked === true })
												}
												aria-label="Enabled"
											/>
										</div>
									</TableCell>
									<TableCell className="px-2">
										<Select
											value={row.matchType ?? "contains"}
											onValueChange={(
												value: "contains" | "starts_with" | "exact",
											) => updateRow(row.id, { matchType: value })}
										>
											<SelectTrigger className="h-8 min-w-28 w-full rounded-none">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="contains">Contains</SelectItem>
												<SelectItem value="starts_with">Starts with</SelectItem>
												<SelectItem value="exact">Exact</SelectItem>
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="">
										<Input
											value={row.matchPattern}
											onChange={(e) =>
												updateRow(row.id, { matchPattern: e.target.value })
											}
											className="h-8 min-w-24 rounded-none"
										/>
									</TableCell>
									<TableCell className="py-2 px-10">
										<ArrowRight
											size={16}
											weight="regular"
											className="text-muted-foreground"
										/>
									</TableCell>
									<TableCell className="">
										<Select
											value={row.categoryId}
											onValueChange={(value) =>
												updateRow(row.id, { categoryId: value })
											}
										>
											<SelectTrigger className="h-8 min-w-32 w-full rounded-none">
												<SelectValue>
													<span className="inline-flex items-center gap-1.5">
														<span>{row.categoryIcon ?? "—"}</span>
														<span>{row.categoryName || "—"}</span>
													</span>
												</SelectValue>
											</SelectTrigger>
											<SelectContent>
												{categories.map((cat) => (
													<SelectItem key={cat.id} value={cat.id}>
														<span className="inline-flex items-center gap-1.5">
															<span>{cat.icon ?? "—"}</span>
															<span>{cat.name}</span>
														</span>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell className="text-right py-2">
										<Button
											variant="ghost"
											size="sm"
											className="h-8 w-8 p-0 rounded-none text-muted-foreground hover:text-destructive"
											onClick={() => setDeleteConfirmId(row.id)}
											disabled={
												!row.id.startsWith("new-") && deleteMutation.isPending
											}
											aria-label="Delete rule"
										>
											<Trash size={16} weight="regular" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				<div className="mt-6 flex items-center gap-4">
					<Button
						variant="outline"
						onClick={addRow}
						className="rounded-none"
						disabled={categories.length === 0}
					>
						Add rule
					</Button>
					<Button
						disabled={
							!isDirty || saveMutation.isPending || hasNewWithEmptyPattern
						}
						onClick={() => saveMutation.mutate()}
						className="rounded-none"
					>
						{saveMutation.isPending ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</TooltipProvider>
	);
}
