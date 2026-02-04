import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

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

const transactionTypeSchema = z
	.enum(["income", "spending", "all"])
	.optional()
	.default("all")
	.describe(
		"Filter by transaction direction: income (positive), spending (negative), or all",
	);

const queryTransactionsInputSchema = z.object({
	...dateFilterSchema.shape,
	type: transactionTypeSchema,
	categories: z
		.array(z.string())
		.optional()
		.nullable()
		.describe("Filter by category names"),
	merchantSearch: z
		.string()
		.optional()
		.nullable()
		.describe("Search merchant names (partial match)"),
	minAmountCents: z.number().optional().nullable(),
	maxAmountCents: z.number().optional().nullable(),
	limit: z.number().default(50),
});
export const queryTransactionsDef = toolDefinition({
	name: "query_transactions",
	description:
		"Query or list transactions with filters. Use for listing, searching, or finding specific transactions (e.g. show my Apple transactions, list paychecks, find big expenses).",
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

const aggregateInputSchema = z.object({
	...dateFilterSchema.shape,
	type: z
		.enum(["income", "spending", "all"])
		.describe(
			"What to aggregate: income (positive amounts), spending (negative amounts), or all",
		),
	groupBy: z
		.enum(["category", "merchant", "month", "week", "none"])
		.describe(
			"Group results by category, merchant, month, week, or none for a single grand total",
		),
	categories: z
		.array(z.string())
		.optional()
		.nullable()
		.describe("Restrict to these category names"),
	merchantSearch: z
		.string()
		.optional()
		.nullable()
		.describe("Restrict to merchants matching this string (e.g. Apple)"),
	metrics: z
		.array(z.enum(["total", "average", "count", "min", "max"]))
		.default(["total"]),
	comparePeriod: z
		.boolean()
		.optional()
		.nullable()
		.describe("Include comparison with previous period"),
});
export const aggregateDef = toolDefinition({
	name: "aggregate",
	description:
		"Calculate totals, averages, counts, or breakdowns. Use for total income, total spending, how much at a merchant (e.g. Apple), spending by category, income by source, grand total, etc.",
	inputSchema: aggregateInputSchema,
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

const compareInputSchema = z.object({
	periodA: z.object({ start: z.string(), end: z.string() }),
	periodB: z.object({ start: z.string(), end: z.string() }),
	type: z
		.enum(["income", "spending"])
		.describe("Compare income or spending between the two periods"),
	groupBy: z.enum(["category", "merchant"]).optional().nullable(),
	highlightThreshold: z
		.number()
		.default(10)
		.describe("% change threshold to highlight"),
});
export const compareDef = toolDefinition({
	name: "compare",
	description:
		"Compare income or spending between two time periods. Use for before/after, year-over-year (e.g. January vs February spending, income year over year).",
	inputSchema: compareInputSchema,
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
	type: z
		.enum(["income", "spending", "all"])
		.optional()
		.default("spending")
		.describe("Analyze income, spending, or all transactions"),
	categories: z.array(z.string()).optional().nullable(),
});
export const analyzePatternsDef = toolDefinition({
	name: "analyze_patterns",
	description:
		"Analyze transaction patterns for anomalies, trends, recurring, or savings opportunities. Use for weird income?, spending trends, etc.",
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

export {
	queryTransactionsInputSchema,
	aggregateInputSchema,
	compareInputSchema,
	analyzePatternsInputSchema,
};
