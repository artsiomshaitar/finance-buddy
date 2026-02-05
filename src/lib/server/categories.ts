import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { seedCategoriesIfEmpty } from "@/lib/seed-categories";

export const getCategories = createServerFn({ method: "GET" }).handler(
	async () => {
		await seedCategoriesIfEmpty();
		return db
			.select({ id: categories.id, name: categories.name, icon: categories.icon })
			.from(categories);
	},
);

export type CreateCategoryRuleInput = {
	categoryId: string;
	matchPattern: string;
	matchField?: "name" | "merchant_name";
	matchType?: "contains" | "starts_with" | "exact";
	priority?: number;
};

export const createCategoryRule = createServerFn({ method: "POST" })
	.inputValidator((input: { data: CreateCategoryRuleInput }) => input.data)
	.handler(async ({ data }: { data: CreateCategoryRuleInput }) => {
		const id = crypto.randomUUID();
		await db.insert(categoryRules).values({
			id,
			categoryId: data.categoryId,
			matchPattern: data.matchPattern.trim().toLowerCase(),
			matchField: data.matchField ?? "name",
			matchType: data.matchType ?? "contains",
			priority: data.priority ?? 0,
		});
		const [row] = await db
			.select()
			.from(categoryRules)
			.where(eq(categoryRules.id, id));
		return row;
	});
