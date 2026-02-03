import type { InferChatMessages } from "@tanstack/ai-react";
import {
	createChatClientOptions,
	fetchServerSentEvents,
	useChat,
} from "@tanstack/ai-react";

const chatOptions = createChatClientOptions({
	connection: fetchServerSentEvents("/api/chat"),
	tools: [],
});

export type FinanceChatMessages = InferChatMessages<typeof chatOptions>;

export const useFinanceChat = () => useChat(chatOptions);
