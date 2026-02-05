import { Info, Trash } from "@phosphor-icons/react";
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
import {
	EmojiPicker,
	EmojiPickerContent,
	EmojiPickerFooter,
	EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
	type CategoryForSettingsRow,
	createCategory as createCategoryFn,
	deleteCategory as deleteCategoryFn,
	getCategoriesForSettings,
	type UpdateCategoryInput,
	updateCategory as updateCategoryFn,
} from "@/lib/server/categories";

export const Route = createFileRoute("/settings/categories")({
	component: SettingsCategoriesPage,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData({
			queryKey: ["categories-for-settings"],
			queryFn: () => getCategoriesForSettings(),
		});
	},
});

type CategoryRow = CategoryForSettingsRow;

function SettingsCategoriesPage() {
	const queryClient = useQueryClient();
	const { data: serverData = [] } = useQuery({
		queryKey: ["categories-for-settings"],
		queryFn: () => getCategoriesForSettings(),
	});
	const [editRows, setEditRows] = useState<CategoryRow[]>([]);
	const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	useEffect(() => {
		if (serverData.length > 0 && dirtyIds.size === 0) {
			setEditRows([...serverData]);
		}
	}, [serverData, dirtyIds.size]);

	const updateCategory = useServerFn(updateCategoryFn);
	const createCategory = useServerFn(createCategoryFn);
	const deleteCategory = useServerFn(deleteCategoryFn);

	const updateRow = (id: string, patch: Partial<CategoryRow>) => {
		setEditRows((prev) =>
			prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
		);
		setDirtyIds((prev) => new Set(prev).add(id));
	};

	const addRow = () => {
		const newId = `new-${crypto.randomUUID()}`;
		const newRow: CategoryRow = {
			id: newId,
			name: "",
			icon: null,
			color: null,
			parentId: null,
			isSystem: false,
			isIncome: false,
			excludeFromSpending: false,
			budgetCents: null,
			hasTransactions: false,
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
					if (!row.name?.trim()) continue;
					await createCategory({
						data: {
							name: row.name.trim(),
							icon: row.icon ?? null,
							color: row.color ?? null,
							isIncome: !!(row.isIncome ?? false),
							excludeFromSpending: !!(row.excludeFromSpending ?? false),
							budgetCents: row.budgetCents ?? null,
						},
					});
				} else {
					const original = serverData.find((r) => r.id === id);
					if (!original) continue;
					const patch: UpdateCategoryInput = { id };
					if (row.name !== original.name) patch.name = row.name;
					if (row.icon !== original.icon) patch.icon = row.icon ?? null;
					if (row.color !== original.color) patch.color = row.color ?? null;
					if (!original.isSystem) {
						if (row.isIncome !== original.isIncome)
							patch.isIncome = row.isIncome ?? undefined;
						if (row.excludeFromSpending !== original.excludeFromSpending)
							patch.excludeFromSpending = row.excludeFromSpending ?? undefined;
						if (row.budgetCents !== original.budgetCents)
							patch.budgetCents = row.budgetCents ?? null;
					}
					if (Object.keys(patch).length === 1) continue;
					await updateCategory({ data: patch });
				}
			}
		},
		onSuccess: () => {
			setDirtyIds(new Set());
			queryClient.invalidateQueries({ queryKey: ["categories-for-settings"] });
			queryClient.invalidateQueries({ queryKey: ["categories"] });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteCategory({ data: { id } }),
		onSuccess: (_, id) => {
			setEditRows((prev) => prev.filter((r) => r.id !== id));
			setDirtyIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			queryClient.invalidateQueries({ queryKey: ["categories-for-settings"] });
			queryClient.invalidateQueries({ queryKey: ["categories"] });
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

	const confirmDelete = () => {
		if (deleteConfirmId) {
			removeRow(deleteConfirmId);
			setDeleteConfirmId(null);
		}
	};

	const isDirty = dirtyIds.size > 0;
	const rows = [...(editRows.length > 0 ? editRows : serverData)].sort(
		(a, b) => (b.isSystem ? 1 : 0) - (a.isSystem ? 1 : 0),
	);
	const hasNewWithEmptyName = rows.some(
		(r) => r.id.startsWith("new-") && !r.name?.trim(),
	);

	return (
		<TooltipProvider>
			<AlertDialog
				open={deleteConfirmId !== null}
				onOpenChange={(open) => !open && setDeleteConfirmId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete category?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove this category. This action cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={confirmDelete}>
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
								<TableHead className="">Icon</TableHead>
								<TableHead className="w-full">Name</TableHead>
								<TableHead className="text-center px-4">
									<span className="inline-flex items-center gap-1">
										Is income
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													aria-label="Explanation for Is income"
												>
													<Info size={14} weight="regular" />
												</button>
											</TooltipTrigger>
											<TooltipContent>
												When enabled, transactions in this category are counted
												as income (e.g. salary, refunds) rather than expenses.
											</TooltipContent>
										</Tooltip>
									</span>
								</TableHead>
								<TableHead className="text-center px-4">
									<span className="inline-flex items-center gap-1">
										Exclude from spending
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="inline-flex text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													aria-label="Explanation for Exclude from spending"
												>
													<Info size={14} weight="regular" />
												</button>
											</TooltipTrigger>
											<TooltipContent>
												When enabled, transactions in this category are not
												included in spending totals (e.g. transfers between
												accounts).
											</TooltipContent>
										</Tooltip>
									</span>
								</TableHead>
								<TableHead className="text-center pr-4">System</TableHead>
								<TableHead className="w-10" />
							</TableRow>
						</TableHeader>
						<TableBody className="">
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="">
										<Popover>
											<PopoverTrigger asChild>
												<Button
													variant="outline"
													size="sm"
													className="h-8 w-8 p-0 rounded-none font-mono text-lg"
												>
													{row.icon ?? "—"}
												</Button>
											</PopoverTrigger>
											<PopoverContent
												className="w-auto p-0 rounded-none border border-border bg-background font-mono"
												align="start"
											>
												<EmojiPicker
													onEmojiSelect={({ emoji }) => {
														updateRow(row.id, { icon: emoji });
													}}
												>
													<EmojiPickerSearch placeholder="Search…" />
													<EmojiPickerContent className="max-h-64" />
													<EmojiPickerFooter />
												</EmojiPicker>
											</PopoverContent>
										</Popover>
									</TableCell>
									<TableCell className="md:pr-[10%]">
										<Input
											value={row.name}
											onChange={(e) =>
												updateRow(row.id, { name: e.target.value })
											}
											className="h-8 min-w-32 w-full"
										/>
									</TableCell>
									<TableCell className="py-2 ">
										<div className="flex justify-center items-center">
											<Checkbox
												checked={row.isIncome ?? false}
												disabled={row.isSystem ?? false}
												onCheckedChange={(checked) => {
													if (!row.isSystem)
														updateRow(row.id, { isIncome: checked === true });
												}}
												aria-label="Is income"
											/>
										</div>
									</TableCell>
									<TableCell className="py-2 ">
										<div className="flex justify-center items-center">
											<Checkbox
												checked={row.excludeFromSpending ?? false}
												disabled={row.isSystem ?? false}
												onCheckedChange={(checked) => {
													if (!row.isSystem)
														updateRow(row.id, {
															excludeFromSpending: checked === true,
														});
												}}
												aria-label="Exclude from spending"
											/>
										</div>
									</TableCell>
									<TableCell className="py-2 text-center text-muted-foreground">
										{row.isSystem ? "Yes" : "—"}
									</TableCell>
									<TableCell className="text-right py-2">
										{(() => {
											const canDelete =
												row.id.startsWith("new-") ||
												(!row.isSystem && !(row.hasTransactions ?? false));
											const button = (
												<Button
													variant="ghost"
													size="sm"
													className="h-8 w-8 p-0 rounded-none text-muted-foreground hover:text-destructive"
													onClick={() => setDeleteConfirmId(row.id)}
													disabled={
														!row.id.startsWith("new-") &&
														deleteMutation.isPending
													}
													aria-label="Delete category"
												>
													<Trash size={16} weight="regular" />
												</Button>
											);
											if (!canDelete) {
												const message = row.isSystem
													? "System categories cannot be deleted."
													: "Cannot delete: this category is used by one or more transactions.";
												return (
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="inline-block">
																<Button
																	variant="ghost"
																	size="sm"
																	className="h-8 w-8 p-0 rounded-none text-muted-foreground opacity-50 cursor-not-allowed"
																	disabled
																	aria-label="Delete category"
																>
																	<Trash size={16} weight="regular" />
																</Button>
															</span>
														</TooltipTrigger>
														<TooltipContent>{message}</TooltipContent>
													</Tooltip>
												);
											}
											return button;
										})()}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				<div className="mt-6 flex items-center gap-4">
					<Button variant="outline" onClick={addRow} className="rounded-none">
						Add category
					</Button>
					<Button
						disabled={!isDirty || saveMutation.isPending || hasNewWithEmptyName}
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
