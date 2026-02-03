import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";

export const getAccounts = createServerFn({ method: "GET" }).handler(
	async () => {
		return db.select().from(accounts).where(eq(accounts.isActive, true));
	},
);

export type CreateAccountInput = {
	name: string;
	institution: string;
	accountType: string;
	mask?: string;
};

export const createAccount = createServerFn({ method: "POST" })
	.inputValidator((input: { data: CreateAccountInput }) => input.data)
	.handler(async ({ data }: { data: CreateAccountInput }) => {
		const id = crypto.randomUUID();
		await db.insert(accounts).values({
			id,
			name: data.name.trim(),
			institution: data.institution,
			accountType: data.accountType,
			mask: data.mask?.trim() ?? null,
		});
		const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
		return row;
	});
