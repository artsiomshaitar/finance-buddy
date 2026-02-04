import { chat, maxIterations, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { createFileRoute } from "@tanstack/react-router";
import { wrapOpenAIWithAGUI } from "@/lib/openai-agui-adapter";
import {
	aggregate,
	analyzePatterns,
	compare,
	queryTransactions,
} from "@/lib/tools/finance";

const SYSTEM_PROMPT = `You are a helpful personal finance assistant with access to the user's transaction history from Bank of America and Capital One.
Use tools to answer any finance question: income, spending, totals by category or merchant, comparisons, lists, breakdowns.
- query_transactions: list or search transactions (filter by type income/spending/all, categories, merchant, date range).
- aggregate: totals, averages, counts, or breakdowns by category/merchant/month/week or grand total (type income/spending/all, optional merchantSearch/categories).
- compare: compare two time periods for income or spending.
- analyze_patterns: anomalies, trends, recurring, savings (type income/spending/all).
Be precise with financial data. Format currency as dollars (convert from cents by dividing by 100).`;

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				console.log("[api/chat] tools:", [
					"query_transactions",
					"aggregate",
					"compare",
					"analyze_patterns",
				]);
				const requestSignal = request.signal;
				if (requestSignal.aborted) {
					return new Response(null, { status: 499 });
				}
				const abortController = new AbortController();
				try {
					if (!process.env.OPENAI_API_KEY) {
						return new Response(
							JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
							{ status: 500, headers: { "Content-Type": "application/json" } },
						);
					}
					const body = await request.json();
					const { messages } = body;
					const stream = chat({
						adapter: wrapOpenAIWithAGUI(openaiText("gpt-4o")),
						messages,
						tools: [queryTransactions, aggregate, compare, analyzePatterns],
						systemPrompts: [SYSTEM_PROMPT],
						agentLoopStrategy: maxIterations(5),
						abortController,
					});
					return toServerSentEventsResponse(stream, {
						abortController,
						headers: { "X-Chat-Version": "agui-v1" },
					});
				} catch (error: unknown) {
					if (
						error instanceof Error &&
						(error.name === "AbortError" || abortController.signal.aborted)
					) {
						return new Response(null, { status: 499 });
					}
					return new Response(
						JSON.stringify({ error: "Failed to process chat request" }),
						{ status: 500, headers: { "Content-Type": "application/json" } },
					);
				}
			},
		},
	},
});
