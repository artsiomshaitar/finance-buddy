export function parseRelativeDates(
	startDate?: string,
	endDate?: string,
): { start: string; end: string } {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	function parseRelative(s: string | undefined): Date | null {
		if (!s || typeof s !== "string") return null;
		const trimmed = s.trim().toLowerCase();
		const match =
			/^(\d+)\s*(day|days|week|weeks|month|months|year|years)\s*ago$/.exec(
				trimmed,
			) ||
			/^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/.exec(trimmed);
		if (match) {
			const n = parseInt(match[1], 10);
			const unit = match[2];
			const d = new Date(today);
			if (unit.startsWith("day")) d.setDate(d.getDate() - n);
			else if (unit.startsWith("week")) d.setDate(d.getDate() - n * 7);
			else if (unit.startsWith("month")) d.setMonth(d.getMonth() - n);
			else if (unit.startsWith("year")) d.setFullYear(d.getFullYear() - n);
			return d;
		}
		if (trimmed === "today") return new Date(today);
		const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
		if (iso) return new Date(iso);
		return null;
	}

	function toYYYYMMDD(d: Date): string {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	}

	const end = parseRelative(endDate) ?? today;
	const startParsed = parseRelative(startDate);
	const start = startParsed
		? toYYYYMMDD(startParsed)
		: toYYYYMMDD(
				(() => {
					const d = new Date(end);
					d.setMonth(d.getMonth() - 1);
					return d;
				})(),
			);
	const endStr = toYYYYMMDD(end);
	return {
		start: start < endStr ? start : endStr,
		end: endStr,
	};
}

export function formatCents(cents: number): string {
	const sign = cents < 0 ? "-" : "";
	return `${sign}$${Math.abs(cents / 100).toFixed(2)}`;
}
