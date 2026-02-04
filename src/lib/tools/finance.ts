import {
	and,
	between,
	desc,
	eq,
	gte,
	inArray,
	lte,
	or,
	sql,
} from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { parseRelativeDates } from "@/lib/date-utils";
import {
	aggregateDef,
	type aggregateInputSchema,
	analyzePatternsDef,
	type analyzePatternsInputSchema,
	compareDef,
	type compareInputSchema,
	queryTransactionsDef,
	type queryTransactionsInputSchema,
} from "@/lib/tools/finance-defs";

async function getCategoryIdByName(name: string): Promise<string | null> {
	const rows = await db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.name, name))
		.limit(1);
	return rows[0]?.id ?? null;
}

function amountFilter(
	type: "income" | "spending" | "all",
): ReturnType<typeof gte> | ReturnType<typeof lte> | undefined {
	if (type === "income") return gte(transactions.amountCents, 1);
	if (type === "spending") return lte(transactions.amountCents, 0);
	return undefined;
}

const spendingCategoryFilter = or(
	sql`${transactions.categoryId} is null`,
	eq(categories.excludeFromSpending, false),
);

export const queryTransactions = queryTransactionsDef.server(async (input) => {
	const i = input as z.infer<typeof queryTransactionsInputSchema>;
	const { start, end } = parseRelativeDates(i.startDate, i.endDate);
	const conditions = [
		between(transactions.date, start, end),
		amountFilter(i.type ?? "all"),
		i.minAmountCents != null
			? gte(transactions.amountCents, i.minAmountCents)
			: undefined,
		i.maxAmountCents != null
			? lte(transactions.amountCents, i.maxAmountCents)
			: undefined,
	].filter(Boolean);
	if (i.categories?.length) {
		const ids = await Promise.all(
			i.categories.map((n: string) => getCategoryIdByName(n)),
		);
		const validIds = ids.filter(
			(id: string | null): id is string => id != null,
		);
		if (validIds.length) {
			conditions.push(inArray(transactions.categoryId, validIds));
		}
	}
	const rows = await db
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
		.where(and(...conditions))
		.orderBy(desc(transactions.date))
		.limit(i.limit);
	let result = rows.map((r) => ({
		id: r.id,
		date: r.date,
		name: r.name,
		merchantName: r.merchantName,
		amountCents: r.amountCents,
		categoryName: r.categoryName,
	}));
	if (i.merchantSearch) {
		const q = i.merchantSearch.toLowerCase();
		result = result.filter((r) =>
			(r.merchantName ?? r.name).toLowerCase().includes(q),
		);
	}
	return result;
});

export const aggregate = aggregateDef.server(async (input) => {
	const i = input as z.infer<typeof aggregateInputSchema>;
	const { start, end } = parseRelativeDates(i.startDate, i.endDate);
	const amtFilter = amountFilter(i.type);
	const categoryFilter =
		i.type === "spending" ? and(amtFilter, spendingCategoryFilter) : amtFilter;
	const baseConditions = [
		categoryFilter,
		between(transactions.date, start, end),
	];
	if (i.categories?.length) {
		const ids = await Promise.all(
			i.categories.map((n: string) => getCategoryIdByName(n)),
		);
		const validIds = ids.filter(
			(id: string | null): id is string => id != null,
		);
		if (validIds.length) {
			baseConditions.push(inArray(transactions.categoryId, validIds));
		}
	}
	if (i.merchantSearch) {
		const q = `%${i.merchantSearch.toLowerCase()}%`;
		baseConditions.push(
			or(
				sql`lower(coalesce(${transactions.merchantName}, '')) like ${q}`,
				sql`lower(${transactions.name}) like ${q}`,
			) ?? sql`1=0`,
		);
	}
	const conditions = and(...baseConditions);
	if (i.groupBy === "none") {
		const [row] = await db
			.select({
				total: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else ${transactions.amountCents} end), 0)`,
				count: sql<number>`count(*)`,
			})
			.from(transactions)
			.leftJoin(categories, eq(transactions.categoryId, categories.id))
			.where(conditions);
		const totalCents = Number(row?.total ?? 0);
		const count = Number(row?.count ?? 0);
		return [{ group: "total", totalCents, count }];
	}
	const groupCol =
		i.groupBy === "category"
			? transactions.categoryId
			: i.groupBy === "merchant"
				? transactions.merchantName
				: i.groupBy === "month"
					? sql<string>`substr(${transactions.date}, 1, 7)`
					: transactions.date;
	const rows = await db
		.select({
			group: groupCol,
			total: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else ${transactions.amountCents} end), 0)`,
			count: sql<number>`count(*)`,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(conditions)
		.groupBy(groupCol);
	const categoryNames =
		i.groupBy === "category" ? await db.select().from(categories) : [];
	const nameMap = Object.fromEntries(categoryNames.map((c) => [c.id, c.name]));
	return rows.map((r) => ({
		group:
			i.groupBy === "category"
				? (nameMap[String(r.group ?? "")] ?? r.group ?? "Uncategorized")
				: String(r.group ?? "Unknown"),
		totalCents: Number(r.total),
		count: Number(r.count),
	}));
});

export const compare = compareDef.server(async (input) => {
	const i = input as z.infer<typeof compareInputSchema>;
	const amtFilter =
		i.type === "income"
			? gte(transactions.amountCents, 1)
			: lte(transactions.amountCents, 0);
	const categoryFilter =
		i.type === "spending" ? and(amtFilter, spendingCategoryFilter) : amtFilter;
	const [periodARows] = await db
		.select({
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			and(
				categoryFilter,
				between(transactions.date, i.periodA.start, i.periodA.end),
			),
		);
	const [periodBRows] = await db
		.select({
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(
			and(
				categoryFilter,
				between(transactions.date, i.periodB.start, i.periodB.end),
			),
		);
	const periodATotal = Math.abs(Number(periodARows?.total ?? 0));
	const periodBTotal = Math.abs(Number(periodBRows?.total ?? 0));
	const changePercent =
		periodBTotal !== 0
			? ((periodATotal - periodBTotal) / periodBTotal) * 100
			: 0;
	return {
		periodATotalCents: periodATotal,
		periodBTotalCents: periodBTotal,
		changePercent,
		breakdown: [],
	};
});

export const analyzePatterns = analyzePatternsDef.server(async (input) => {
	const i = input as z.infer<typeof analyzePatternsInputSchema>;
	const { start, end } = parseRelativeDates(i.startDate, i.endDate);
	const amtFilter = amountFilter(i.type ?? "spending");
	const categoryFilter =
		(i.type ?? "spending") === "spending"
			? and(amtFilter, spendingCategoryFilter)
			: amtFilter;
	const rows = await db
		.select({
			id: transactions.id,
			amountCents: transactions.amountCents,
			name: transactions.name,
			date: transactions.date,
		})
		.from(transactions)
		.leftJoin(categories, eq(transactions.categoryId, categories.id))
		.where(and(categoryFilter, between(transactions.date, start, end)))
		.orderBy(desc(transactions.date))
		.limit(100);
	const total = rows.reduce(
		(s, r) =>
			s + (i.type === "income" ? r.amountCents : Math.abs(r.amountCents)),
		0,
	);
	const avg = rows.length ? total / rows.length : 0;
	const findings: Array<{
		type: string;
		description: string;
		transactions?: string[];
		amountCents?: number;
		confidence: number;
	}> = [];
	if (i.analysisType === "anomalies" && rows.length) {
		const threshold = avg * 2;
		for (const r of rows) {
			const abs = Math.abs(r.amountCents);
			if (abs > threshold) {
				findings.push({
					type: "anomaly",
					description: `Unusual amount ${(abs / 100).toFixed(2)} for ${r.name}`,
					transactions: [r.id],
					amountCents: r.amountCents,
					confidence: 0.8,
				});
			}
		}
	}
	const kind = i.type ?? "spending";
	return {
		findings,
		recommendations:
			findings.length > 0
				? ["Review unusual transactions for accuracy."]
				: [
						`${kind === "income" ? "Income" : "Spending"} looks consistent for the period.`,
					],
	};
});
