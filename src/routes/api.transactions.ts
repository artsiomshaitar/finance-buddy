import { createFileRoute } from "@tanstack/react-router";
import { and, between, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { parseRelativeDates } from "@/lib/date-utils";

export const Route = createFileRoute("/api/transactions")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const startDate = url.searchParams.get("startDate") ?? undefined;
				const endDate = url.searchParams.get("endDate") ?? undefined;
				const accountId = url.searchParams.get("accountId") ?? undefined;
				const categoryId = url.searchParams.get("categoryId") ?? undefined;
				const limit = Math.min(
					parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
					100,
				);
				const { start, end } = parseRelativeDates(startDate, endDate);
				const conditions = [
					between(transactions.date, start, end),
					accountId ? eq(transactions.accountId, accountId) : undefined,
					categoryId ? eq(transactions.categoryId, categoryId) : undefined,
				].filter(Boolean);
				const rows = await db
					.select()
					.from(transactions)
					.where(and(...conditions))
					.orderBy(desc(transactions.date))
					.limit(limit);
				return Response.json(rows);
			},
			POST: async ({ request }) => {
				const body = (await request.json()) as {
					accountId: string;
					amountCents: number;
					date: string;
					name: string;
					merchantName?: string;
					categoryId?: string;
					externalId?: string;
				};
				const id = crypto.randomUUID();
				await db.insert(transactions).values({
					id,
					accountId: body.accountId,
					amountCents: body.amountCents,
					date: body.date,
					name: body.name,
					merchantName: body.merchantName ?? null,
					categoryId: body.categoryId ?? null,
					externalId: body.externalId ?? null,
				});
				const [row] = await db
					.select()
					.from(transactions)
					.where(eq(transactions.id, id));
				return Response.json(row);
			},
		},
	},
});
