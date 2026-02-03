import { createFileRoute } from "@tanstack/react-router";
import * as Recharts from "recharts";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getDashboardData } from "@/lib/dashboard-server";
import { formatCents } from "@/lib/date-utils";

export const Route = createFileRoute("/dashboard")({
	component: DashboardPage,
	loader: async () => await getDashboardData(),
});

function DashboardPage() {
	const data = Route.useLoaderData();
	const totalSpent = data.thisMonthSpentCents;
	const maxCategory = Math.max(
		...data.categoryBreakdown.map((c) => c.totalCents),
		1,
	);

	return (
		<div className="min-h-screen bg-background font-mono p-6">
			<div className="grid gap-4 md:grid-cols-3 mb-8">
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>TOTAL SPENT</CardDescription>
						<CardTitle className="text-2xl">
							{formatCents(-totalSpent)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Progress
							value={Math.min(
								(totalSpent / data.defaultBudgetCents) * 100,
								100,
							)}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>vs LAST MONTH</CardDescription>
						<CardTitle className="text-2xl flex items-center gap-1">
							{data.changePercent >= 0 ? "↑" : "↓"}{" "}
							{Math.abs(data.changePercent).toFixed(1)}%
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Progress
							value={
								data.changePercent >= 0
									? Math.min(data.changePercent, 100)
									: Math.min(Math.abs(data.changePercent), 100)
							}
						/>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardDescription>BUDGET LEFT</CardDescription>
						<CardTitle className="text-2xl">
							{formatCents(data.budgetRemainingCents)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Progress
							value={
								(data.budgetRemainingCents / data.defaultBudgetCents) * 100
							}
						/>
					</CardContent>
				</Card>
			</div>

			<div className="mb-8">
				<h2 className="text-sm font-medium mb-4">CATEGORY BREAKDOWN</h2>
				{data.categoryBreakdown.filter((c) => c.totalCents > 0).length > 0 && (
					<Card className="mb-4">
						<CardContent className="pt-4">
							<ChartContainer
								config={
									Object.fromEntries(
										data.categoryBreakdown
											.filter((c) => c.totalCents > 0)
											.sort((a, b) => b.totalCents - a.totalCents)
											.slice(0, 8)
											.map((c, i) => [
												c.categoryName,
												{
													label: c.categoryName,
													color: `var(--chart-${(i % 5) + 1})`,
												},
											]),
									) as ChartConfig
								}
								className="h-[240px] w-full"
							>
								<Recharts.BarChart
									data={data.categoryBreakdown
										.filter((c) => c.totalCents > 0)
										.sort((a, b) => b.totalCents - a.totalCents)
										.slice(0, 8)
										.map((c) => ({
											name: c.categoryName,
											total: c.totalCents / 100,
										}))}
									layout="vertical"
									margin={{ left: 0, right: 8 }}
								>
									<Recharts.XAxis type="number" hide />
									<Recharts.YAxis
										type="category"
										dataKey="name"
										tickLine={false}
										axisLine={false}
										width={100}
										tick={{ fontSize: 12 }}
									/>
									<Recharts.Bar
										dataKey="total"
										radius={[0, 4, 4, 0]}
										fill="hsl(var(--chart-1))"
									>
										<ChartTooltip
											content={
												<ChartTooltipContent
													formatter={(value) => [
														`$${Number(value).toFixed(2)}`,
														"Spent",
													]}
												/>
											}
										/>
									</Recharts.Bar>
								</Recharts.BarChart>
							</ChartContainer>
						</CardContent>
					</Card>
				)}
				<div className="space-y-3">
					{data.categoryBreakdown
						.filter((c) => c.totalCents > 0)
						.sort((a, b) => b.totalCents - a.totalCents)
						.map((row) => (
							<div
								key={row.categoryId ?? "uncategorized"}
								className="flex items-center gap-4"
							>
								<span className="w-32 truncate text-sm">
									{row.categoryName}
								</span>
								<span className="text-sm tabular-nums">
									{formatCents(-row.totalCents)}
								</span>
								<div className="flex-1 max-w-xs">
									<Progress value={(row.totalCents / maxCategory) * 100} />
								</div>
								<span className="text-sm text-muted-foreground w-12">
									{totalSpent > 0
										? ((row.totalCents / totalSpent) * 100).toFixed(1)
										: 0}
									%
								</span>
							</div>
						))}
					{data.categoryBreakdown.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No spending this month yet.
						</p>
					)}
				</div>
			</div>

			<div>
				<h2 className="text-sm font-medium mb-4">RECENT TRANSACTIONS</h2>
				<Card>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Category</TableHead>
								<TableHead className="text-right">Amount</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.recent.map((tx) => (
								<TableRow key={tx.id}>
									<TableCell className="font-mono text-xs">{tx.date}</TableCell>
									<TableCell>{tx.merchantName ?? tx.name}</TableCell>
									<TableCell>
										<Badge variant="secondary" className="font-normal">
											{tx.categoryName ?? "Uncategorized"}
										</Badge>
									</TableCell>
									<TableCell
										className={`text-right tabular-nums ${
											tx.amountCents < 0 ? "text-destructive" : "text-chart-3"
										}`}
									>
										{formatCents(tx.amountCents)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					{data.recent.length === 0 && (
						<div className="p-8 text-center text-muted-foreground text-sm">
							No transactions yet.
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
