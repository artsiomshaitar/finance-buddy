import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export type LlmCategorizeInput = {
	transactions: Array<{ description: string; amountCents: number }>;
	categoryList: Array<{ id: string; name: string }>;
};

const SuggestionItemSchema = z.object({
	categoryId: z.string().nullable(),
	suggestedMatchPattern: z.string().nullable(),
	likelyRecurring: z.boolean(),
});

const CategorizeResponseSchema = z.object({
	suggestions: z.array(SuggestionItemSchema),
});

export type LlmSuggestion = z.infer<typeof SuggestionItemSchema>;

const SAFE_FALLBACK = (n: number): LlmSuggestion[] =>
	Array.from({ length: n }, () => ({
		categoryId: null,
		suggestedMatchPattern: null,
		likelyRecurring: false,
	}));

export async function suggestCategoriesWithLlm(
	input: LlmCategorizeInput,
): Promise<LlmSuggestion[]> {
	if (!process.env.OPENAI_API_KEY || input.transactions.length === 0) {
		return SAFE_FALLBACK(input.transactions.length);
	}

	const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

	const categoryLines = input.categoryList
		.map((c) => `- ${c.id}: ${c.name}`)
		.join("\n");
	const txLines = input.transactions
		.map(
			(t, i) =>
				`${i + 1}. description: "${t.description}" | amountCents: ${t.amountCents}`,
		)
		.join("\n");

	const prompt = `You are a finance categorizer. Given a list of categories and uncategorized bank transactions, suggest a category and an optional match pattern for each transaction.
Use category "transfer" for payments to credit cards, debt payoff, or account-to-account transfers (these are not consumption expenses).

Categories (use the id):
${categoryLines}

Uncategorized transactions (use the same order in your response):
${txLines}

For each transaction return categoryId (one of the category ids above or null), suggestedMatchPattern (short substring like merchant/brand e.g. TMOBILE, AMZN, UBER, or null), and likelyRecurring (true for subscriptions/regular bills, false for one-off). The suggestions array must have exactly ${input.transactions.length} items in the same order as the transactions list.`;

	try {
		const response = await client.responses.parse({
			model: "gpt-4o",
			input: [{ role: "user", content: prompt }],
			text: {
				format: zodTextFormat(
					CategorizeResponseSchema,
					"categorize_suggestions",
				),
			},
		});

		const parsed = response.output_parsed;
		if (!parsed) {
			return SAFE_FALLBACK(input.transactions.length);
		}

		const validIds = new Set(input.categoryList.map((c) => c.id));
		return parsed.suggestions.map((s) => {
			const catId =
				s.categoryId != null && validIds.has(String(s.categoryId))
					? String(s.categoryId)
					: null;
			const pattern =
				s.suggestedMatchPattern != null &&
				s.suggestedMatchPattern.trim().length > 0
					? s.suggestedMatchPattern.trim()
					: null;
			return {
				categoryId: catId,
				suggestedMatchPattern: pattern,
				likelyRecurring: s.likelyRecurring,
			};
		});
	} catch {
		return SAFE_FALLBACK(input.transactions.length);
	}
}
