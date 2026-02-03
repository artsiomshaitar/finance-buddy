import {
	CircleNotchIcon,
	FileTextIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/date-utils";
import type { ParsedTransaction } from "@/lib/pdf-parser";

type UploadResult = {
	bank: "bofa" | "capital_one" | "unknown";
	transactions: ParsedTransaction[];
	needsReview: ParsedTransaction[];
};

function FinanceUploadPage() {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<UploadResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragOver, setDragOver] = useState(false);
	const fileInputId = useId();

	const onDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const f = e.dataTransfer.files[0];
		if (
			f?.type === "application/pdf" ||
			f?.name.toLowerCase().endsWith(".pdf")
		) {
			setFile(f);
			setResult(null);
			setError(null);
		} else {
			setError("Please drop a PDF file.");
		}
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
		const f = e.target.files?.[0];
		if (f) {
			setFile(f);
			setResult(null);
			setError(null);
		}
	};

	const upload = async () => {
		if (!file) return;
		setLoading(true);
		setError(null);
		try {
			const formData = new FormData();
			formData.set("file", file);
			const res = await fetch("/api/upload", {
				method: "POST",
				body: formData,
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? res.statusText);
			}
			const data: UploadResult = await res.json();
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

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
						className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
							dragOver
								? "border-primary bg-muted/50"
								: "border-muted-foreground/25"
						}`}
					>
						{file ? (
							<div className="flex items-center justify-center gap-2 text-sm">
								<FileTextIcon className="h-5 w-5" />
								{file.name}
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setFile(null);
										setResult(null);
									}}
								>
									Clear
								</Button>
							</div>
						) : (
							<>
								<p className="text-muted-foreground mb-2">
									Drag and drop PDF here
								</p>
								<input
									type="file"
									accept=".pdf,application/pdf"
									onChange={onFileChange}
									className="hidden"
									id={fileInputId}
									aria-label="Choose PDF file"
								/>
								<Button
									variant="outline"
									type="button"
									onClick={() => document.getElementById(fileInputId)?.click()}
								>
									<UploadSimpleIcon className="h-4 w-4 mr-2" />
									Choose file
								</Button>
							</>
						)}
					</section>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{file && (
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
							<p className="text-xs text-muted-foreground">
								Import and categorization (with confidence review) coming next.
							</p>
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
