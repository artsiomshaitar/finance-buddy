import {
	CheckCircleIcon,
	CircleNotchIcon,
	LightningIcon,
	PaperPlaneTiltIcon,
	StopIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	type FinanceChatMessages,
	useFinanceChat,
} from "@/lib/finance-chat-hook";
import {
	getToolCallError,
	parseToolCallArguments,
} from "@/lib/tool-call-utils";

function getTextContent(
	parts: FinanceChatMessages[number]["parts"],
): string | null {
	for (const part of parts) {
		if (part.type === "text" && part.content) return part.content;
	}
	return null;
}

function Messages({ messages }: { messages: FinanceChatMessages }) {
	const containerRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom when messages change
	useEffect(() => {
		containerRef.current?.scrollTo({
			top: containerRef.current.scrollHeight,
		});
	}, [messages.length]);

	return (
		<div
			ref={containerRef}
			className="flex-1 overflow-y-auto p-4 font-mono text-sm"
		>
			{messages.map((message) => (
				<div
					key={message.id}
					className={`mb-4 ${message.role === "user" ? "text-right" : ""}`}
				>
					{message.role === "user" && (
						<div className="inline-block rounded-none bg-muted px-3 py-2 text-left max-w-2/3">
							{getTextContent(message.parts)}
						</div>
					)}
					{message.role === "assistant" && (
						<div className="space-y-2 text-left max-w-2/3">
							{message.parts.map((part, idx) => {
								if (part.type === "text" && part.content) {
									return (
										<div
											key={`text-${message.id}-${idx}`}
											className="rounded-none border bg-card px-3 py-2 whitespace-pre-wrap"
										>
											{part.content}
										</div>
									);
								}
								if (part.type === "tool-call") {
									const partError = getToolCallError(part.output);
									const pending = !part.output && !partError;
									const done = !!part.output && !partError;
									const failed = !!partError;
									const argsObj = parseToolCallArguments(part.arguments);
									return (
										<Card
											key={part.id ?? `tool-${idx}`}
											className="overflow-hidden"
										>
											<CardContent className="p-3">
												<div className="flex items-center gap-2 text-muted-foreground">
													{pending && (
														<CircleNotchIcon className="h-4 w-4 animate-spin" />
													)}
													{done && (
														<CheckCircleIcon className="h-4 w-4 text-chart-3" />
													)}
													{failed && (
														<WarningCircleIcon className="h-4 w-4 text-destructive" />
													)}
													{!pending && !done && !failed && (
														<LightningIcon className="h-4 w-4" />
													)}
													<span className="font-medium">{part.name}</span>
												</div>
												{Object.keys(argsObj).length > 0 && (
													<pre className="mt-2 text-xs overflow-x-auto bg-muted/50 p-2 rounded">
														{JSON.stringify(argsObj, null, 2)}
													</pre>
												)}
												{part.output != null && !partError && (
													<details className="mt-2">
														<summary className="cursor-pointer text-xs text-muted-foreground">
															View result
														</summary>
														<pre className="mt-1 text-xs overflow-x-auto bg-muted/50 p-2 rounded max-h-40 overflow-y-auto">
															{typeof part.output === "string"
																? part.output
																: JSON.stringify(part.output, null, 2)}
														</pre>
													</details>
												)}
												{partError && (
													<p className="mt-2 text-xs text-destructive">
														{String(partError)}
													</p>
												)}
											</CardContent>
										</Card>
									);
								}
								return null;
							})}
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function FinanceChatPage() {
	const [input, setInput] = useState("");
	const { messages, sendMessage, isLoading, stop } = useFinanceChat();

	return (
		<div className="grid grid-rows-[auto_1fr_auto] h-[calc(100vh-80px)] max-w-4xl mx-auto w-full px-4 pb-6 bg-background font-mono">
			{/* Header */}
			<div className="border-b px-4 py-2">
				<h1 className="text-lg font-semibold">Finance Chat</h1>
				<p className="text-xs text-muted-foreground">
					Ask about spending, transactions, or budgets.
				</p>
			</div>
			<Messages messages={messages} />
			<div className="border-t p-4 bg-muted/30">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (input.trim()) {
							sendMessage(input);
							setInput("");
						}
					}}
					className="flex gap-2"
				>
					<Input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="How much did I spend on restaurants last month?"
						disabled={isLoading}
						className="flex-1 font-mono"
					/>
					{isLoading ? (
						<Button variant="outline" size="sm" onClick={stop}>
							<StopIcon className="size-4" />
						</Button>
					) : (
						<Button type="submit" disabled={!input.trim() || isLoading}>
							<PaperPlaneTiltIcon className="size-4" />
						</Button>
					)}
				</form>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/finance/chat")({
	component: FinanceChatPage,
});
