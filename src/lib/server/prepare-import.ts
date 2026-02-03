import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, categoryRules, transactions } from "@/db/schema";
import { categorizeTransaction } from "@/lib/categorize";
import type { ParsedTransaction } from "@/lib/pdf-parser";
import { seedCategoriesIfEmpty } from "@/lib/seed-categories";
import { suggestCategoriesWithLlm } from "@/lib/server/llm-categorize";

export type PreparedTransaction = ParsedTransaction & {
	categoryId: string | null;
	confidence: number;
	source: "rule" | "ml" | "manual" | "llm";
	explanation: string[];
	suggestedMatchPattern?: string | null;
	likelyRecurring?: boolean;
};

export type PrepareImportInput = {
	accountId: string;
	parsedTransactions: ParsedTransaction[];
};

export const prepareImport = createServerFn({ method: "POST" })
	.inputValidator((input: PrepareImportInput) => input)
	.handler(async ({ data }: { data: PrepareImportInput }) => {
		await seedCategoriesIfEmpty();
		const rules = await db
			.select()
			.from(categoryRules)
			.where(eq(categoryRules.isEnabled, true));
		const historical = await db
			.select({
				id: transactions.id,
				name: transactions.name,
				merchantName: transactions.merchantName,
				amountCents: transactions.amountCents,
				categoryId: transactions.categoryId,
			})
			.from(transactions);

		const rulesForCategorize = rules
			.filter(
				(r) =>
					r.matchField != null && r.matchType != null && r.isEnabled !== false,
			)
			.map((r) => ({
				id: r.id,
				categoryId: r.categoryId,
				matchField: r.matchField as "name" | "merchant_name",
				matchPattern: r.matchPattern,
				matchType: r.matchType as "contains" | "starts_with" | "exact",
				isEnabled: r.isEnabled ?? true,
				priority: r.priority,
			}));

		const historicalForCategorize = historical.map((t) => ({
			id: t.id,
			name: t.name,
			merchantName: t.merchantName,
			amountCents: t.amountCents,
			categoryId: t.categoryId,
		}));

		const result: PreparedTransaction[] = [];
		for (const tx of data.parsedTransactions) {
			const signedCents =
				tx.type === "credit" ? tx.amountCents : -tx.amountCents;
			const cat = await categorizeTransaction(
				{
					name: tx.description,
					merchantName: null,
					amountCents: signedCents,
				},
				rulesForCategorize,
				historicalForCategorize,
			);
			result.push({
				...tx,
				categoryId: cat.categoryId,
				confidence: cat.confidence,
				source: cat.source,
				explanation: cat.explanation,
			});
		}

		const uncategorized = result.filter(
			(t) => t.source === "manual" && t.categoryId == null,
		);
		const deeler = uncategorized.find((t) => t.description.includes("DEELER"));
		console.log(JSON.stringify(deeler, null, 2));
		// if (uncategorized.length > 0 && process.env.OPENAI_API_KEY) {
		// 	const categoriesFromDb = await db
		// 		.select({ id: categories.id, name: categories.name })
		// 		.from(categories);
		// 	const llmInput = {
		// 		transactions: uncategorized.map((t) => ({
		// 			description: t.description,
		// 			amountCents: t.type === "credit" ? t.amountCents : -t.amountCents,
		// 		})),
		// 		categoryList: categoriesFromDb,
		// 	};
		// 	const suggestions = await suggestCategoriesWithLlm(llmInput);
		// 	let idx = 0;
		// 	for (let i = 0; i < result.length && idx < suggestions.length; i++) {
		// 		const r = result[i];
		// 		if (r.source === "manual" && r.categoryId == null) {
		// 			const s = suggestions[idx++];
		// 			if (s?.categoryId) {
		// 				result[i] = {
		// 					...r,
		// 					categoryId: s.categoryId,
		// 					confidence: 0.75,
		// 					source: "llm",
		// 					explanation: ["LLM suggested category"],
		// 					suggestedMatchPattern: s.suggestedMatchPattern ?? null,
		// 					likelyRecurring: s.likelyRecurring ?? false,
		// 				};
		// 			}
		// 		}
		// 	}
		// }

		return result;
	});

export type ImportTransactionsInput = {
	accountId: string;
	transactions: PreparedTransaction[];
};

function stableExternalId(tx: PreparedTransaction): string {
	const input = `${tx.date}-${tx.description}-${tx.amountCents}`;
	return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 24);
}

export const importTransactions = createServerFn({ method: "POST" })
	.inputValidator((input: ImportTransactionsInput) => input)
	.handler(async ({ data }: { data: ImportTransactionsInput }) => {
		const rows = data.transactions.map((tx) => {
			const id = crypto.randomUUID();
			const externalId = tx.externalId ?? stableExternalId(tx);
			const amountCents =
				tx.type === "credit" ? tx.amountCents : -tx.amountCents;
			return {
				id,
				accountId: data.accountId,
				externalId,
				amountCents,
				date: tx.date,
				name: tx.description,
				merchantName: null as string | null,
				categoryId: tx.categoryId ?? null,
				autoCategorized: tx.source !== "manual",
			};
		});
		await db
			.insert(transactions)
			.values(rows)
			.onConflictDoUpdate({
				target: [transactions.accountId, transactions.externalId],
				set: {
					amountCents: sql`excluded.amount_cents`,
					merchantName: sql`excluded.merchant_name`,
					categoryId: sql`excluded.category_id`,
					autoCategorized: sql`excluded.auto_categorized`,
					updatedAt: sql`(unixepoch())`,
				},
			});
		return { imported: rows.length };
	});
