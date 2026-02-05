import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
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
	getCategoriesForSettings,
	type UpdateCategoryInput,
	updateCategory as updateCategoryFn,
} from "@/lib/server/categories";
import { Info } from "@phosphor-icons/react";

export const Route = createFileRoute("/settings/categories")({
	component: SettingsCategoriesPage,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData({
			queryKey: ["categories-for-settings"],
			queryFn: () => getCategoriesForSettings(),
		});
	},
});

type CategoryRow = Awaited<ReturnType<typeof getCategoriesForSettings>>[number];

function SettingsCategoriesPage() {
	const queryClient = useQueryClient();
	const { data: serverData = [] } = useQuery({
		queryKey: ["categories-for-settings"],
		queryFn: () => getCategoriesForSettings(),
	});
	const [editRows, setEditRows] = useState<CategoryRow[]>([]);
	const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
	useEffect(() => {
		if (serverData.length > 0 && dirtyIds.size === 0) {
			setEditRows([...serverData]);
		}
	}, [serverData, dirtyIds.size]);

	const updateCategory = useServerFn(updateCategoryFn);

	const updateRow = (id: string, patch: Partial<CategoryRow>) => {
		setEditRows((prev) =>
			prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
		);
		setDirtyIds((prev) => new Set(prev).add(id));
	};

	const saveMutation = useMutation({
		mutationFn: async () => {
			const dirtyList = Array.from(dirtyIds);
			const results: (CategoryRow | null)[] = [];
			for (const id of dirtyList) {
				const row = editRows.find((r) => r.id === id);
				const original = serverData.find((r) => r.id === id);
				if (!row || !original) continue;
				const patch: UpdateCategoryInput = { id };
				if (row.name !== original.name) patch.name = row.name;
				if (row.icon !== original.icon) patch.icon = row.icon ?? null;
				if (row.color !== original.color) patch.color = row.color ?? null;
				if (!original.isSystem) {
					if (row.isIncome !== original.isIncome) patch.isIncome = row.isIncome;
					if (row.excludeFromSpending !== original.excludeFromSpending)
						patch.excludeFromSpending = row.excludeFromSpending;
					if (row.budgetCents !== original.budgetCents)
						patch.budgetCents = row.budgetCents ?? null;
				}
				if (Object.keys(patch).length === 1) continue;
				const res = await updateCategory({ data: patch });
				results.push(res ?? null);
			}
			return { dirtyList, results };
		},
		onSuccess: (_, __, ___) => {
			setDirtyIds(new Set());
			queryClient.invalidateQueries({ queryKey: ["categories-for-settings"] });
			queryClient.invalidateQueries({ queryKey: ["categories"] });
		},
	});

	const isDirty = dirtyIds.size > 0;
	const rows = editRows.length > 0 ? editRows : serverData;

	return (
		<TooltipProvider>
			<div className="max-w-7xl mx-auto">
				<div className="overflow-x-auto border border-border">
					<Table className="table-auto">
						<TableHeader>
							<TableRow>
								<TableHead className="w-min">Icon</TableHead>
								<TableHead className="w-min">Name</TableHead>
								<TableHead className="text-center w-min px-4">
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
								<TableHead className="text-center w-min px-4">
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
								<TableHead className="text-center w-min pr-4">System</TableHead>
							</TableRow>
						</TableHeader>
					<TableBody className="">
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell className="w-0">
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
								<TableCell className="w-auto md:pr-[10%]">
									<Input
										value={row.name}
										onChange={(e) =>
											updateRow(row.id, { name: e.target.value })
										}
										className="h-8 min-w-32 w-full"
									/>
								</TableCell>
								<TableCell className="w-0 py-2 ">
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
								<TableCell className="w-0 py-2 ">
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
								<TableCell className="w-0 py-2 text-center text-muted-foreground">
									{row.isSystem ? "Yes" : "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			<div className="mt-6">
				<Button
					disabled={!isDirty || saveMutation.isPending}
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
