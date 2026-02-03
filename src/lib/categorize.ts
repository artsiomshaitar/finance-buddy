type CategoryRule = {
	id: string;
	categoryId: string;
	matchField: "name" | "merchant_name";
	matchPattern: string;
	matchType: "contains" | "starts_with" | "exact";
	isEnabled: boolean;
	priority: number;
};

type TransactionRow = {
	id: string;
	name: string;
	merchantName: string | null;
	amountCents: number;
	categoryId: string | null;
};

export interface CategorizationResult {
	categoryId: string | null;
	confidence: number;
	source: "rule" | "ml" | "manual";
	explanation: string[];
}

function matchesPattern(
	field: string | null | undefined,
	pattern: string,
	matchType: string,
): boolean {
	if (field == null) return false;
	const lower = field.toLowerCase();
	const pat = pattern.toLowerCase();
	if (matchType === "exact") return lower === pat;
	if (matchType === "starts_with") return lower.startsWith(pat);
	return lower.includes(pat);
}

function findSimilarTransactions(
	name: string,
	historical: TransactionRow[],
	limit: number,
): TransactionRow[] {
	const nameLower = name.toLowerCase();
	const scored = historical
		.filter((t) => t.name.toLowerCase() !== nameLower)
		.map((t) => {
			const tLower = t.name.toLowerCase();
			let score = 0;
			const words = nameLower.split(/\s+/);
			for (const w of words) {
				if (w.length > 2 && tLower.includes(w)) score += 1;
			}
			return { tx: t, score };
		})
		.filter((s) => s.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((s) => s.tx);
	return scored;
}

export async function categorizeTransaction(
	tx: { name: string; merchantName?: string | null; amountCents: number },
	rules: CategoryRule[],
	historicalData: TransactionRow[],
): Promise<CategorizationResult> {
	const sortedRules = rules
		.filter((r) => r.isEnabled)
		.sort((a, b) => b.priority - a.priority);

	for (const rule of sortedRules) {
		const field =
			rule.matchField === "merchant_name" ? tx.merchantName : tx.name;
		if (matchesPattern(field, rule.matchPattern, rule.matchType)) {
			return {
				categoryId: rule.categoryId,
				confidence: 1.0,
				source: "rule",
				explanation: [`Matched rule: "${rule.matchPattern}"`],
			};
		}
	}

	const similar = findSimilarTransactions(tx.name, historicalData, 10);
	if (similar.length >= 3) {
		const categoryVotes: Record<string, number> = {};
		for (const t of similar) {
			if (t.categoryId) {
				categoryVotes[t.categoryId] = (categoryVotes[t.categoryId] ?? 0) + 1;
			}
		}
		const entries = Object.entries(categoryVotes).sort(([, a], [, b]) => b - a);
		const [topCategory, count] = entries[0] ?? [];
		if (topCategory && count >= 2) {
			const confidence = Math.min(0.95, 0.6 + count * 0.1);
			return {
				categoryId: topCategory,
				confidence,
				source: "ml",
				explanation: [
					`Similar to ${count} past transactions`,
					`Confidence: ${(confidence * 100).toFixed(0)}%`,
				],
			};
		}
	}

	return {
		categoryId: null,
		confidence: 0,
		source: "manual",
		explanation: ["No matching rule or similar transactions found"],
	};
}

export const CONFIDENCE_THRESHOLDS = {
	AUTO_ACCEPT: 0.85,
	SUGGEST: 0.6,
	MANUAL: 0,
} as const;
