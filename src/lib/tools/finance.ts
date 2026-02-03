import { toolDefinition } from "@tanstack/ai";
import { and, between, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { parseRelativeDates } from "@/lib/date-utils";

const dateFilterSchema = z.object({
	startDate: z
		.string()
		.optional()
		.describe("Start date (YYYY-MM-DD) or relative: '3 weeks ago'"),
	endDate: z
		.string()
		.optional()
		.describe("End date (YYYY-MM-DD) or relative: 'today'"),
});

const queryTransactionsInputSchema = z.object({
	...dateFilterSchema.shape,
	categories: z
		.array(z.string())
		.optional()
		.describe("Filter by category names"),
	merchantSearch: z
		.string()
		.optional()
		.describe("Search merchant names (partial match)"),
	minAmountCents: z.number().optional(),
	maxAmountCents: z.number().optional(),
	limit: z.number().default(50),
});
export const queryTransactionsDef = toolDefinition({
	name: "query_transactions",
	description:
		"Query user transactions with filters. Use for listing, searching, or finding specific transactions.",
	inputSchema: queryTransactionsInputSchema,
	outputSchema: z.array(
		z.object({
			id: z.string(),
			date: z.string(),
			name: z.string(),
			merchantName: z.string().nullable(),
			amountCents: z.number(),
			categoryName: z.string().nullable(),
		}),
	),
});

const aggregateSpendingInputSchema = z.object({
	...dateFilterSchema.shape,
	groupBy: z.enum(["category", "merchant", "month", "week"]),
	metrics: z
		.array(z.enum(["total", "average", "count", "min", "max"]))
		.default(["total"]),
	comparePeriod: z
		.boolean()
		.optional()
		.describe("Include comparison with previous period"),
});
export const aggregateSpendingDef = toolDefinition({
	name: "aggregate_spending",
	description:
		"Calculate spending totals, averages, or counts. Use for 'how much', 'average', or 'total' questions.",
	inputSchema: aggregateSpendingInputSchema,
	outputSchema: z.array(
		z.object({
			group: z.string(),
			totalCents: z.number(),
			averageCents: z.number().optional(),
			count: z.number(),
			previousPeriodCents: z.number().optional(),
			changePercent: z.number().optional(),
		}),
	),
});

const compareSpendingInputSchema = z.object({
	periodA: z.object({ start: z.string(), end: z.string() }),
	periodB: z.object({ start: z.string(), end: z.string() }),
	groupBy: z.enum(["category", "merchant"]).optional(),
	highlightThreshold: z
		.number()
		.default(10)
		.describe("% change threshold to highlight"),
});
export const compareSpendingDef = toolDefinition({
	name: "compare_spending",
	description:
		"Compare spending between two time periods. Use for before/after, year-over-year analysis.",
	inputSchema: compareSpendingInputSchema,
	outputSchema: z.object({
		periodATotalCents: z.number(),
		periodBTotalCents: z.number(),
		changePercent: z.number(),
		breakdown: z.array(
			z.object({
				group: z.string(),
				periodACents: z.number(),
				periodBCents: z.number(),
				changePercent: z.number(),
				highlighted: z.boolean(),
			}),
		),
	}),
});

const analyzePatternsInputSchema = z.object({
	analysisType: z.enum([
		"anomalies",
		"trends",
		"recurring",
		"savings_opportunities",
	]),
	...dateFilterSchema.shape,
	categories: z.array(z.string()).optional(),
});
export const analyzePatternsDef = toolDefinition({
	name: "analyze_patterns",
	description:
		"Analyze transaction patterns for anomalies, trends, or savings opportunities.",
	inputSchema: analyzePatternsInputSchema,
	outputSchema: z.object({
		findings: z.array(
			z.object({
				type: z.string(),
				description: z.string(),
				transactions: z.array(z.string()).optional(),
				amountCents: z.number().optional(),
				confidence: z.number(),
			}),
		),
		recommendations: z.array(z.string()),
	}),
});

async function getCategoryIdByName(name: string): Promise<string | null> {
	const rows = await db
		.select({ id: categories.id })
		.from(categories)
		.where(eq(categories.name, name))
		.limit(1);
	return rows[0]?.id ?? null;
}

export const queryTransactions = queryTransactionsDef.server(async (input) => {
	const i = input as z.infer<typeof queryTransactionsInputSchema>;
	const { start, end } = parseRelativeDates(i.startDate, i.endDate);
	const conditions = [
		between(transactions.date, start, end),
		i.minAmountCents != null
			? gte(transactions.amountCents, i.minAmountCents)
			: undefined,
		i.maxAmountCents != null
			? lte(transactions.amountCents, i.maxAmountCents)
			: undefined,
	];
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

export const aggregateSpending = aggregateSpendingDef.server(async (input) => {
	const i = input as z.infer<typeof aggregateSpendingInputSchema>;
	const { start, end } = parseRelativeDates(i.startDate, i.endDate);
	const debitFilter = lte(transactions.amountCents, 0);
	const groupCol =
		i.groupBy === "category"
			? transactions.categoryId
			: i.groupBy === "merchant"
				? transactions.merchantName
				: transactions.date;
	const rows = await db
		.select({
			group: groupCol,
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
			count: sql<number>`count(*)`,
		})
		.from(transactions)
		.where(and(debitFilter, between(transactions.date, start, end)))
		.groupBy(groupCol);
	const categoryNames =
		i.groupBy === "category" ? await db.select().from(categories) : [];
	const nameMap = Object.fromEntries(categoryNames.map((c) => [c.id, c.name]));
	return rows.map((r) => ({
		group:
			i.groupBy === "category"
				? (nameMap[r.group ?? ""] ?? r.group ?? "Uncategorized")
				: (r.group ?? "Unknown"),
		totalCents: Math.abs(Number(r.total)),
		count: Number(r.count),
	}));
});

export const compareSpending = compareSpendingDef.server(async (input) => {
	const i = input as z.infer<typeof compareSpendingInputSchema>;
	const [periodARows] = await db
		.select({
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.where(
			and(
				lte(transactions.amountCents, 0),
				between(transactions.date, i.periodA.start, i.periodA.end),
			),
		);
	const [periodBRows] = await db
		.select({
			total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
		})
		.from(transactions)
		.where(
			and(
				lte(transactions.amountCents, 0),
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
	const rows = await db
		.select({
			id: transactions.id,
			amountCents: transactions.amountCents,
			name: transactions.name,
			date: transactions.date,
		})
		.from(transactions)
		.where(
			and(
				lte(transactions.amountCents, 0),
				between(transactions.date, start, end),
			),
		)
		.orderBy(desc(transactions.date))
		.limit(100);
	const total = rows.reduce((s, r) => s + Math.abs(r.amountCents), 0);
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
	return {
		findings,
		recommendations:
			findings.length > 0
				? ["Review unusual transactions for accuracy."]
				: ["Spending looks consistent for the period."],
	};
});
