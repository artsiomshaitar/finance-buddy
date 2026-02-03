import { createHash } from "node:crypto";

export interface ParsedTransaction {
	date: string;
	description: string;
	amountCents: number;
	externalId: string | null;
	type: "debit" | "credit";
}

function normalizeDateFromGroups(mm: string, dd: string, yy?: string): string {
	const y = yy ? 2000 + parseInt(yy, 10) : new Date().getFullYear();
	return `${y}-${mm}-${dd}`;
}

function hashTransactionId(input: string): string {
	return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 24);
}

function generateTransactionIdTwoAmount(
	match: RegExpExecArray,
	amountCol: string,
): string {
	const mm = match[1];
	const dd = match[2];
	const desc = match[4];
	const input = `${mm}-${dd}-${amountCol}-${desc.trim()}`;
	return hashTransactionId(input);
}

export function detectBank(text: string): "bofa" | "capital_one" | "unknown" {
	if (text.includes("Bank of America")) return "bofa";
	if (text.includes("Capital One")) return "capital_one";
	return "unknown";
}

function generateTransactionIdSingle(match: RegExpExecArray): string {
	const mm = match[1];
	const dd = match[2];
	const desc = match[4];
	const amt = match[5];
	const input = `${mm}-${dd}-${amt}-${desc.trim()}`;
	return hashTransactionId(input);
}

const BoA_TWO_AMOUNT_RE =
	/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/(\d{2}))?\s+([\s\S]+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;
const BoA_SINGLE_AMOUNT_RE =
	/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/(\d{2}))?\s+([\s\S]+?)\s+(-?[\d,]+\.\d{2})(?=\s*\n|\s*$|\s+\D)/gm;

function parseBoATransactions(text: string): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	let match = BoA_TWO_AMOUNT_RE.exec(text);
	while (match !== null) {
		const yy = match[3];
		const date = normalizeDateFromGroups(match[1], match[2], yy);
		const description = match[4].replace(/\s+/g, " ").trim();
		const col1Str = match[5].replace(/,/g, "");
		const col2Str = match[6].replace(/,/g, "");
		const col1Cents = Math.round(parseFloat(col1Str) * 100);
		const col2Cents = Math.round(parseFloat(col2Str) * 100);
		const isDeposit = col1Cents !== 0;
		const amountCents = isDeposit ? col1Cents : col2Cents;
		const amountStr = isDeposit ? col1Str : col2Str;
		if (amountCents !== 0) {
			transactions.push({
				date,
				description,
				amountCents,
				externalId: generateTransactionIdTwoAmount(match, amountStr),
				type: isDeposit ? "credit" : "debit",
			});
		}
		match = BoA_TWO_AMOUNT_RE.exec(text);
	}
	const seen = new Set(
		transactions.map((t) => `${t.date}:${t.description}:${t.amountCents}`),
	);
	match = BoA_SINGLE_AMOUNT_RE.exec(text);
	while (match !== null) {
		const yy = match[3];
		const amountStr = match[5].replace(/,/g, "");
		const amountCents = Math.round(parseFloat(amountStr) * 100);
		const desc = match[4].replace(/\s+/g, " ").trim();
		const key = `${normalizeDateFromGroups(match[1], match[2], yy)}:${desc}:${Math.abs(amountCents)}`;
		if (!seen.has(key)) {
			seen.add(key);
			const isDebit = amountStr.startsWith("-");
			transactions.push({
				date: normalizeDateFromGroups(match[1], match[2], yy),
				description: desc,
				amountCents: Math.abs(amountCents),
				externalId: generateTransactionIdSingle(match),
				type: isDebit ? "debit" : "credit",
			});
		}
		match = BoA_SINGLE_AMOUNT_RE.exec(text);
	}
	return transactions;
}

const CAPITAL_ONE_TX_RE =
	/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/(\d{2}))?\s+(.+?)\s+([\d,]+\.\d{2})/g;

function parseCapitalOneTransactions(text: string): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	let match = CAPITAL_ONE_TX_RE.exec(text);
	while (match !== null) {
		const yy = match[3];
		transactions.push({
			date: normalizeDateFromGroups(match[1], match[2], yy),
			description: match[4].trim(),
			amountCents: Math.round(parseFloat(match[5].replace(/,/g, "")) * 100),
			externalId: generateTransactionIdSingle(match),
			type: "debit",
		});
		match = CAPITAL_ONE_TX_RE.exec(text);
	}
	return transactions;
}

const Y_THRESHOLD = 5;

type TextItemLike = { str: string; transform: number[]; hasEOL?: boolean };

function extractPageTextInReadingOrder(content: {
	items: Array<unknown>;
}): string {
	const items = content.items.filter((item: unknown): item is TextItemLike => {
		const t = item as TextItemLike;
		return typeof t.str === "string" && Array.isArray(t.transform);
	});
	items.sort((a, b) => {
		const aY = a.transform[5] ?? 0;
		const bY = b.transform[5] ?? 0;
		if (Math.abs(aY - bY) > Y_THRESHOLD) return bY - aY;
		return (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
	});
	let pageText = "";
	for (let i = 0; i < items.length; i++) {
		pageText += items[i].str;
		if (i < items.length - 1) {
			pageText += items[i].hasEOL ? "\n" : " ";
		}
	}
	return pageText;
}

export async function parseStatement(
	pdfBuffer: ArrayBuffer,
	options?: { includeRawText?: boolean; rawTextLimit?: number },
): Promise<{
	bank: "bofa" | "capital_one" | "unknown";
	transactions: ParsedTransaction[];
	needsReview: ParsedTransaction[];
	rawText?: string;
}> {
	const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) })
		.promise;
	const pageTexts: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		pageTexts.push(extractPageTextInReadingOrder(content));
	}
	const fullText = pageTexts.join("\n");
	const bank = detectBank(fullText);
	const transactions =
		bank === "bofa"
			? parseBoATransactions(fullText)
			: bank === "capital_one"
				? parseCapitalOneTransactions(fullText)
				: [];
	const needsReview = transactions.filter((t) => !t.externalId);
	const result: {
		bank: "bofa" | "capital_one" | "unknown";
		transactions: ParsedTransaction[];
		needsReview: ParsedTransaction[];
		rawText?: string;
	} = { bank, transactions, needsReview };
	if (options?.includeRawText ?? options?.rawTextLimit != null) {
		const limit = options.rawTextLimit ?? 3000;
		result.rawText = limit > 0 ? fullText.slice(0, limit) : fullText;
	}
	return result;
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
