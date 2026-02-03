import { createServerFn } from "@tanstack/react-start";
import { parseStatement } from "@/lib/pdf-parser";

const MAX_FILES = 10;

function getFiles(formData: FormData): File[] {
	const file = formData.get("file");
	if (file instanceof File && file.size > 0) return [file];
	const files = formData.getAll("files[]");
	const out: File[] = [];
	for (const f of files) {
		if (f instanceof File && f.size > 0) out.push(f);
	}
	if (out.length > 0) return out;
	const single = formData.getAll("file");
	for (const f of single) {
		if (f instanceof File && f.size > 0) out.push(f);
	}
	return out;
}

export const uploadFile = createServerFn({ method: "POST" })
	.inputValidator((input: FormData) => input)
	.handler(async ({ data: formData }) => {
		const files = getFiles(formData);
		if (files.length === 0) throw new Error("Missing file(s)");
		if (files.length > MAX_FILES)
			throw new Error(`Maximum ${MAX_FILES} PDFs per upload`);

		for (const file of files) {
			if (
				file.type !== "application/pdf" &&
				!file.name.toLowerCase().endsWith(".pdf")
			) {
				throw new Error("Only PDF files are supported");
			}
		}

		const debugParam = formData.get("debug");
		const debug =
			debugParam === "1" || String(debugParam).toLowerCase() === "true";

		const allTransactions: Awaited<
			ReturnType<typeof parseStatement>
		>["transactions"] = [];
		const allNeedsReview: Awaited<
			ReturnType<typeof parseStatement>
		>["needsReview"] = [];
		let bank: "bofa" | "capital_one" | "unknown" | "mixed" = "unknown";

		for (const file of files) {
			const buffer = await file.arrayBuffer();
			const parsed = await parseStatement(buffer, { includeRawText: debug });
			if (bank === "unknown" && parsed.bank !== "unknown") bank = parsed.bank;
			else if (
				bank !== "unknown" &&
				parsed.bank !== "unknown" &&
				bank !== parsed.bank
			)
				bank = "mixed";
			allTransactions.push(...parsed.transactions);
			allNeedsReview.push(...parsed.needsReview);
		}

		return {
			bank,
			transactions: allTransactions,
			needsReview: allNeedsReview,
		};
	});
