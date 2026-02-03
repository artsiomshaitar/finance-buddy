import { createServerFn } from "@tanstack/react-start";
import { parseStatement } from "@/lib/pdf-parser";

export const uploadFile = createServerFn({ method: "POST" })
	.inputValidator((input: FormData) => input)
	.handler(async ({ data: formData }) => {
		const file = formData.get("file") as File | null;

		if (!file) {
			throw new Error("Missing file");
		}

		if (
			file.type !== "application/pdf" &&
			!file.name.toLowerCase().endsWith(".pdf")
		) {
			throw new Error("Only PDF files are supported");
		}

		const buffer = await file.arrayBuffer();
		const debugParam = formData.get("debug");
		const debug =
			debugParam === "1" || String(debugParam).toLowerCase() === "true";

		return parseStatement(buffer, { includeRawText: debug });
	});
