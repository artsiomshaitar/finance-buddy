import { clientTools } from "@tanstack/ai-client";
import type { InferChatMessages } from "@tanstack/ai-react";
import {
	createChatClientOptions,
	fetchServerSentEvents,
	useChat,
} from "@tanstack/ai-react";
import {
	aggregateSpendingDef,
	analyzePatternsDef,
	compareSpendingDef,
	queryTransactionsDef,
} from "@/lib/tools/finance";

const queryTransactionsClient = queryTransactionsDef.client(async () => []);
const aggregateSpendingClient = aggregateSpendingDef.client(async () => []);
const compareSpendingClient = compareSpendingDef.client(async () => ({
	periodATotalCents: 0,
	periodBTotalCents: 0,
	changePercent: 0,
	breakdown: [],
}));
const analyzePatternsClient = analyzePatternsDef.client(async () => ({
	findings: [],
	recommendations: [],
}));

const chatOptions = createChatClientOptions({
	connection: fetchServerSentEvents("/api/chat"),
	tools: clientTools(
		queryTransactionsClient,
		aggregateSpendingClient,
		compareSpendingClient,
		analyzePatternsClient,
	),
});

export type FinanceChatMessages = InferChatMessages<typeof chatOptions>;

export const useFinanceChat = () => useChat(chatOptions);
