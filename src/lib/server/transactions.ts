import { createServerFn } from "@tanstack/react-start";
import { and, between, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { parseRelativeDates } from "@/lib/date-utils";

export type GetTransactionsInput = {
	startDate?: string;
	endDate?: string;
	accountId?: string;
	categoryId?: string;
	limit?: number;
};

export const getTransactions = createServerFn({ method: "GET" })
	.inputValidator((input: GetTransactionsInput) => input ?? {})
	.handler(async ({ data }: { data: GetTransactionsInput }) => {
		const { startDate, endDate, accountId, categoryId, limit: rawLimit } =
			data ?? {};
		const limit = Math.min(Number(rawLimit) || 50, 100);
		const { start, end } = parseRelativeDates(startDate, endDate);
		const conditions = [
			between(transactions.date, start, end),
			accountId ? eq(transactions.accountId, accountId) : undefined,
			categoryId ? eq(transactions.categoryId, categoryId) : undefined,
		].filter(Boolean);
		return db
			.select()
			.from(transactions)
			.where(and(...conditions))
			.orderBy(desc(transactions.date))
			.limit(limit);
	});

export type CreateTransactionInput = {
	accountId: string;
	amountCents: number;
	date: string;
	name: string;
	merchantName?: string;
	categoryId?: string;
	externalId?: string;
};

export const createTransaction = createServerFn({ method: "POST" })
	.inputValidator((input: { data: CreateTransactionInput }) => input.data)
	.handler(async ({ data }: { data: CreateTransactionInput }) => {
		const id = crypto.randomUUID();
		await db.insert(transactions).values({
			id,
			accountId: data.accountId,
			amountCents: data.amountCents,
			date: data.date,
			name: data.name,
			merchantName: data.merchantName ?? null,
			categoryId: data.categoryId ?? null,
			externalId: data.externalId ?? null,
		});
		const [row] = await db
			.select()
			.from(transactions)
			.where(eq(transactions.id, id));
		return row;
	});
