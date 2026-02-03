import { chat, maxIterations, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import { createFileRoute } from "@tanstack/react-router";
import {
	aggregateSpending,
	analyzePatterns,
	compareSpending,
	queryTransactions,
} from "@/lib/tools/finance";

const SYSTEM_PROMPT = `You are a helpful personal finance assistant with access to the user's transaction history from Bank of America and Capital One.
Always use tools to answer questions about spending. Be precise with financial data.
Format currency as dollars (convert from cents by dividing by 100).`;

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
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
					const body = (await request.json()) as {
						messages: Array<{ role: string; content?: string }>;
						sessionId?: string;
					};
					const { messages } = body;
					const stream = chat({
						adapter: openaiText("gpt-4o"),
						messages,
						tools: [
							queryTransactions,
							aggregateSpending,
							compareSpending,
							analyzePatterns,
						],
						systemPrompts: [SYSTEM_PROMPT],
						agentLoopStrategy: maxIterations(5),
						abortController,
					});
					return toServerSentEventsResponse(stream, { abortController });
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
