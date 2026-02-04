import { clientTools } from "@tanstack/ai-client";
import type { InferChatMessages } from "@tanstack/ai-react";
import {
	createChatClientOptions,
	fetchServerSentEvents,
	useChat,
} from "@tanstack/ai-react";
import {
	aggregateDef,
	analyzePatternsDef,
	compareDef,
	queryTransactionsDef,
} from "@/lib/tools/finance-defs";

const queryTransactionsClient = queryTransactionsDef.client(async () => []);
const aggregateClient = aggregateDef.client(async () => []);
const compareClient = compareDef.client(async () => ({
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
		aggregateClient,
		compareClient,
		analyzePatternsClient,
	),
});

export type FinanceChatMessages = InferChatMessages<typeof chatOptions>;

export const useFinanceChat = () => useChat(chatOptions);
