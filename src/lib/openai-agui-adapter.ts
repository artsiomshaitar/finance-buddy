import type { AnyTextAdapter, StreamChunk, TextOptions } from "@tanstack/ai";

type OpenAIChunk =
	| {
			type: "content";
			id: string;
			model: string;
			timestamp: number;
			delta: string;
			content: string;
			role?: string;
	  }
	| {
			type: "tool_call";
			id: string;
			model: string;
			timestamp: number;
			index?: number;
			toolCall: {
				id: string;
				type: string;
				function: { name: string; arguments: string };
			};
	  }
	| {
			type: "done";
			id: string;
			model: string;
			timestamp: number;
			usage?: {
				promptTokens: number;
				completionTokens: number;
				totalTokens: number;
			};
			finishReason: string;
	  }
	| {
			type: "thinking";
			id: string;
			model: string;
			timestamp: number;
			delta: string;
			content: string;
	  }
	| {
			type: "error";
			id: string;
			model: string;
			timestamp: number;
			error: { message: string; code?: string };
	  };

const AGUI_TYPES = new Set([
	"RUN_STARTED",
	"RUN_FINISHED",
	"RUN_ERROR",
	"TEXT_MESSAGE_START",
	"TEXT_MESSAGE_CONTENT",
	"TEXT_MESSAGE_END",
	"TOOL_CALL_START",
	"TOOL_CALL_ARGS",
	"TOOL_CALL_END",
	"STEP_STARTED",
	"STEP_FINISHED",
	"STATE_SNAPSHOT",
	"STATE_DELTA",
	"CUSTOM",
]);

function isAGUIChunk(chunk: unknown): chunk is StreamChunk {
	return (
		typeof chunk === "object" &&
		chunk !== null &&
		"type" in chunk &&
		AGUI_TYPES.has((chunk as StreamChunk).type)
	);
}

async function* convertOpenAIStreamToAGUI(
	stream: AsyncIterable<StreamChunk | OpenAIChunk>,
): AsyncGenerator<StreamChunk> {
	for await (const chunk of stream) {
		if (isAGUIChunk(chunk)) {
			yield chunk;
			continue;
		}
		const c = chunk as OpenAIChunk;
		if (c.type === "content") {
			yield {
				type: "TEXT_MESSAGE_CONTENT",
				timestamp: c.timestamp,
				model: c.model,
				messageId: c.id,
				delta: c.delta ?? "",
				content: c.content,
			};
			continue;
		}
		if (c.type === "tool_call") {
			const toolCallId = c.toolCall?.id ?? "";
			const toolName = c.toolCall?.function?.name ?? "";
			const args = c.toolCall?.function?.arguments?.trim() || "{}";
			yield {
				type: "TOOL_CALL_START",
				timestamp: c.timestamp,
				model: c.model,
				toolCallId,
				toolName,
				index: c.index ?? 0,
			};
			yield {
				type: "TOOL_CALL_ARGS",
				timestamp: c.timestamp,
				model: c.model,
				toolCallId,
				delta: args,
				args,
			};
			let input: unknown;
			try {
				input = JSON.parse(args);
			} catch {
				input = undefined;
			}
			yield {
				type: "TOOL_CALL_END",
				timestamp: c.timestamp,
				model: c.model,
				toolCallId,
				toolName,
				input,
			};
			continue;
		}
		if (c.type === "done") {
			yield {
				type: "RUN_FINISHED",
				timestamp: c.timestamp,
				model: c.model,
				runId: c.id,
				finishReason: c.finishReason as
					| "stop"
					| "length"
					| "content_filter"
					| "tool_calls"
					| null,
				usage: c.usage,
			};
			continue;
		}
		if (c.type === "thinking") {
			yield {
				type: "STEP_FINISHED",
				timestamp: c.timestamp,
				model: c.model,
				stepId: c.id,
				delta: c.delta ?? "",
				content: c.content,
			};
			continue;
		}
		if (c.type === "error") {
			yield {
				type: "RUN_ERROR",
				timestamp: c.timestamp,
				model: c.model,
				runId: c.id,
				error: c.error,
			};
			continue;
		}
		continue;
	}
}

export function wrapOpenAIWithAGUI(adapter: AnyTextAdapter): AnyTextAdapter {
	return {
		kind: adapter.kind,
		name: adapter.name,
		model: adapter.model,
		"~types": adapter["~types"],
		chatStream(options: TextOptions) {
			return convertOpenAIStreamToAGUI(adapter.chatStream(options));
		},
		structuredOutput: adapter.structuredOutput.bind(adapter),
	};
}
