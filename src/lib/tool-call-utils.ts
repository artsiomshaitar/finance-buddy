export function getToolCallError(output: unknown): string | undefined {
	if (output == null || typeof output !== "object" || !("error" in output)) {
		return undefined;
	}
	const err = (output as Record<string, unknown>).error;
	return typeof err === "string" ? err : undefined;
}

export function parseToolCallArguments(args: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(args || "{}");
		return typeof parsed === "object" && parsed != null ? parsed : {};
	} catch {
		return {};
	}
}
