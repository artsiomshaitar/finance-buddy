export interface ParsedTransaction {
	date: string;
	description: string;
	amountCents: number;
	externalId: string | null;
	type: "debit" | "credit";
}

function normalizeDate(mmSlashDd: string): string {
	const [mm, dd] = mmSlashDd.split("/");
	const y = new Date().getFullYear();
	return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function generateTransactionId(match: RegExpExecArray): string {
	const input = `${match[1]}-${match[3]}-${match[2].slice(0, 20)}`;
	return Buffer.from(input, "utf-8")
		.toString("base64")
		.slice(0, 16)
		.replace(/[+/=]/g, "x");
}

function detectTransactionType(
	_text: string,
	_index: number,
): "debit" | "credit" {
	return "debit";
}

export function detectBank(text: string): "bofa" | "capital_one" | "unknown" {
	if (text.includes("Bank of America")) return "bofa";
	if (text.includes("Capital One")) return "capital_one";
	return "unknown";
}

function parseBoATransactions(text: string): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	const txRegex = /(\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;
	let match = txRegex.exec(text);
	while (match !== null) {
		transactions.push({
			date: normalizeDate(match[1]),
			description: match[2].trim(),
			amountCents: Math.round(parseFloat(match[3].replace(/,/g, "")) * 100),
			externalId: generateTransactionId(match),
			type: detectTransactionType(text, match.index),
		});
		match = txRegex.exec(text);
	}
	return transactions;
}

function parseCapitalOneTransactions(text: string): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	const txRegex = /(\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})/g;
	let match = txRegex.exec(text);
	while (match !== null) {
		transactions.push({
			date: normalizeDate(match[1]),
			description: match[2].trim(),
			amountCents: Math.round(parseFloat(match[3].replace(/,/g, "")) * 100),
			externalId: generateTransactionId(match),
			type: "debit",
		});
		match = txRegex.exec(text);
	}
	return transactions;
}

export async function parseStatement(pdfBuffer: ArrayBuffer): Promise<{
	bank: "bofa" | "capital_one" | "unknown";
	transactions: ParsedTransaction[];
	needsReview: ParsedTransaction[];
}> {
	const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) })
		.promise;
	let fullText = "";
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		fullText +=
			content.items
				.map((item: { str?: string }) => (item as { str: string }).str ?? "")
				.join(" ") + "\n";
	}
	const bank = detectBank(fullText);
	const transactions =
		bank === "bofa"
			? parseBoATransactions(fullText)
			: bank === "capital_one"
				? parseCapitalOneTransactions(fullText)
				: [];
	const needsReview = transactions.filter((t) => !t.externalId);
	return {
		bank,
		transactions,
		needsReview,
	};
}

export function validateExtraction(
	transactions: ParsedTransaction[],
	startBalanceCents: number,
	endBalanceCents: number,
): { valid: boolean; calculatedEnd: number; difference: number } {
	const calculatedEnd = transactions.reduce(
		(sum, tx) =>
			sum + (tx.type === "credit" ? tx.amountCents : -tx.amountCents),
		startBalanceCents,
	);
	return {
		valid: Math.abs(calculatedEnd - endBalanceCents) < 100,
		calculatedEnd,
		difference: calculatedEnd - endBalanceCents,
	};
}
