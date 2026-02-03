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

function generateTransactionId(match: RegExpExecArray): string {
	const mm = match[1];
	const dd = match[2];
	const desc = match[4];
	const amt = match[5];
	const input = `${mm}-${dd}-${amt}-${desc.trim()}`;
	return hashTransactionId(input);
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

function generateTransactionIdSingle(match: RegExpExecArray): string {
	const mm = match[1];
	const dd = match[2];
	const desc = match[4];
	const amt = match[5];
	const input = `${mm}-${dd}-${amt}-${desc.trim()}`;
	return hashTransactionId(input);
}

const BoA_TWO_AMOUNT_RE =
	/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/(\d{2}))?\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;
const BoA_SINGLE_AMOUNT_RE =
	/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?:\/(\d{2}))?\s+(.+?)\s+(-?[\d,]+\.\d{2})(?=\s*\n|\s*$)/gm;

function parseBoATransactions(text: string): ParsedTransaction[] {
	const transactions: ParsedTransaction[] = [];
	let match = BoA_TWO_AMOUNT_RE.exec(text);
	while (match !== null) {
		const yy = match[3];
		transactions.push({
			date: normalizeDateFromGroups(match[1], match[2], yy),
			description: match[4].trim(),
			amountCents: Math.round(parseFloat(match[5].replace(/,/g, "")) * 100),
			externalId: generateTransactionId(match),
			type: detectTransactionType(text, match.index),
		});
		match = BoA_TWO_AMOUNT_RE.exec(text);
	}
	const seen = new Set(transactions.map((t) => `${t.date}:${t.description}`));
	match = BoA_SINGLE_AMOUNT_RE.exec(text);
	while (match !== null) {
		const yy = match[3];
		const key = `${normalizeDateFromGroups(match[1], match[2], yy)}:${match[4].trim()}`;
		if (!seen.has(key)) {
			seen.add(key);
			const amountStr = match[5].replace(/,/g, "");
			const amountCents = Math.round(parseFloat(amountStr) * 100);
			const isCredit = amountStr.startsWith("-");
			transactions.push({
				date: normalizeDateFromGroups(match[1], match[2], yy),
				description: match[4].trim(),
				amountCents: Math.abs(amountCents),
				externalId: generateTransactionIdSingle(match),
				type: isCredit ? "credit" : "debit",
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
	options?: { includeRawText?: boolean },
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
	if (options?.includeRawText) {
		result.rawText = fullText.slice(0, 3000);
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
