import { createServerFn } from "@tanstack/react-start";
import { and, between, desc, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { seedCategoriesIfEmpty } from "@/lib/seed-categories";

function monthBounds(monthOffset: number): { start: string; end: string } {
	const d = new Date();
	d.setMonth(d.getMonth() + monthOffset);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const start = `${y}-${m}-01`;
	const lastDay = new Date(y, d.getMonth() + 1, 0);
	const end = `${y}-${m}-${String(lastDay.getDate()).padStart(2, "0")}`;
	return { start, end };
}

export const getDashboardData = createServerFn({
	method: "GET",
}).handler(async () => {
	await seedCategoriesIfEmpty();
	const thisMonth = monthBounds(0);
	const lastMonth = monthBounds(-1);
	const debitFilter = lte(transactions.amountCents, 0);
	const spendingCategoryFilter = or(
		sql`${transactions.categoryId} is null`,
		eq(categories.excludeFromSpending, false),
	);

	const [thisMonthRows] = await db
		.select({
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			and(
				debitFilter,
				spendingCategoryFilter,
				between(transactions.date, thisMonth.start, thisMonth.end),
			),
		);
	const [lastMonthRows] = await db
		.select({
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			and(
				debitFilter,
				spendingCategoryFilter,
				between(transactions.date, lastMonth.start, lastMonth.end),
			),
		);

	const thisMonthSpent = Number(thisMonthRows?.total ?? 0);
	const lastMonthSpent = Number(lastMonthRows?.total ?? 0);
	const changePercent =
		lastMonthSpent !== 0
			? ((thisMonthSpent - lastMonthSpent) / Math.abs(lastMonthSpent)) * 100
			: 0;

	const categoryBreakdown = await db
		.select({
			categoryId: transactions.categoryId,
			categoryName: categories.name,
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			and(
				debitFilter,
				spendingCategoryFilter,
				between(transactions.date, thisMonth.start, thisMonth.end),
			),
		)
		.groupBy(transactions.categoryId, categories.name);

	const recent = await db
		.select({
			id: transactions.id,
			date: transactions.date,
			name: transactions.name,
			merchantName: transactions.merchantName,
			amountCents: transactions.amountCents,
			categoryName: categories.name,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.orderBy(desc(transactions.date))
		.limit(10);

	const accountsList = await db
		.select()
		.from(accounts)
		.where(eq(accounts.isActive, true));

	const defaultBudgetCents = 4000_00;
	const budgetRemaining = defaultBudgetCents + thisMonthSpent;

	return {
		thisMonthSpentCents: Math.abs(thisMonthSpent),
		lastMonthSpentCents: Math.abs(lastMonthSpent),
		changePercent,
		budgetRemainingCents: Math.max(0, budgetRemaining),
		defaultBudgetCents,
		categoryBreakdown: categoryBreakdown.map((r) => ({
			categoryId: r.categoryId,
			categoryName: r.categoryName ?? "Uncategorized",
			totalCents: Math.abs(Number(r.total)),
		})),
		recent,
		accounts: accountsList,
	};
});
