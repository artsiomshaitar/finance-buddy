import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, categoryRules } from "@/db/schema";
import { seedCategoriesIfEmpty } from "@/lib/seed-categories";

export const getCategories = createServerFn({ method: "GET" }).handler(
	async () => {
		await seedCategoriesIfEmpty();
		return db
			.select({
				id: categories.id,
				name: categories.name,
				icon: categories.icon,
			})
			.from(categories);
	},
);

export const getCategoriesForSettings = createServerFn({
	method: "GET",
}).handler(async () => {
	await seedCategoriesIfEmpty();
	return db.select().from(categories);
});

export type UpdateCategoryInput = {
	id: string;
	name?: string;
	icon?: string | null;
	color?: string | null;
	isIncome?: boolean;
	excludeFromSpending?: boolean;
	budgetCents?: number | null;
};

export const updateCategory = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateCategoryInput) => {
		const { id, name } = input;
		if (!id || typeof id !== "string") throw new Error("id required");
		if (name !== undefined && (typeof name !== "string" || name.trim() === ""))
			throw new Error("name must be non-empty string");
		return input;
	})
	.handler(async ({ data }) => {
		const { id, ...updates } = data;
		const set = {
			...(updates.name !== undefined && { name: updates.name.trim() }),
			...(updates.icon !== undefined && { icon: updates.icon }),
			...(updates.color !== undefined && { color: updates.color }),
			...(updates.isIncome !== undefined && { isIncome: updates.isIncome }),
			...(updates.excludeFromSpending !== undefined && {
				excludeFromSpending: updates.excludeFromSpending,
			}),
			...(updates.budgetCents !== undefined && {
				budgetCents: updates.budgetCents,
			}),
		};
		if (Object.keys(set).length === 0) return null;
		await db.update(categories).set(set).where(eq(categories.id, id));
		const [row] = await db
			.select()
			.from(categories)
			.where(eq(categories.id, id));
		return row;
	});

export type CreateCategoryRuleInput = {
	categoryId: string;
	matchPattern: string;
	matchField?: "name" | "merchant_name";
	matchType?: "contains" | "starts_with" | "exact";
	priority?: number;
	isEnabled?: boolean;
};

export const createCategoryRule = createServerFn({ method: "POST" })
	.inputValidator((input: CreateCategoryRuleInput) => input)
	.handler(async ({ data }) => {
		const id = crypto.randomUUID();
		await db.insert(categoryRules).values({
			id,
			categoryId: data.categoryId,
			matchPattern: data.matchPattern.trim().toLowerCase(),
			matchField: data.matchField ?? "name",
			matchType: data.matchType ?? "contains",
			priority: data.priority ?? 0,
			isEnabled: data.isEnabled ?? true,
		});
		const [row] = await db
			.select()
			.from(categoryRules)
			.where(eq(categoryRules.id, id));
		return row;
	});

export const getCategoryRulesForSettings = createServerFn({
	method: "GET",
}).handler(async () => {
	await seedCategoriesIfEmpty();
	const rows = await db
		.select({
			id: categoryRules.id,
			categoryId: categoryRules.categoryId,
			matchField: categoryRules.matchField,
			matchType: categoryRules.matchType,
			matchPattern: categoryRules.matchPattern,
			priority: categoryRules.priority,
			isEnabled: categoryRules.isEnabled,
			categoryName: categories.name,
			categoryIcon: categories.icon,
		})
		.from(categoryRules)
		.innerJoin(categories, eq(categoryRules.categoryId, categories.id))
		.orderBy(desc(categoryRules.priority), categoryRules.id);
	return rows;
});

export type UpdateCategoryRuleInput = {
	id: string;
	categoryId?: string;
	matchField?: "name" | "merchant_name";
	matchType?: "contains" | "starts_with" | "exact";
	matchPattern?: string;
	priority?: number;
	isEnabled?: boolean;
};

export const updateCategoryRule = createServerFn({ method: "POST" })
	.inputValidator((input: UpdateCategoryRuleInput) => {
		const { id, matchPattern } = input;
		if (!id || typeof id !== "string") throw new Error("id required");
		if (
			matchPattern !== undefined &&
			(typeof matchPattern !== "string" || matchPattern.trim() === "")
		)
			throw new Error("matchPattern must be non-empty string");
		return input;
	})
	.handler(async ({ data }) => {
		const { id, ...updates } = data;
		const set = {
			...(updates.categoryId !== undefined && {
				categoryId: updates.categoryId,
			}),
			...(updates.matchField !== undefined && {
				matchField: updates.matchField,
			}),
			...(updates.matchType !== undefined && { matchType: updates.matchType }),
			...(updates.matchPattern !== undefined && {
				matchPattern: updates.matchPattern.trim().toLowerCase(),
			}),
			...(updates.priority !== undefined && { priority: updates.priority }),
			...(updates.isEnabled !== undefined && { isEnabled: updates.isEnabled }),
		};
		if (Object.keys(set).length === 0) return null;
		await db.update(categoryRules).set(set).where(eq(categoryRules.id, id));
		const [row] = await db
			.select()
			.from(categoryRules)
			.where(eq(categoryRules.id, id));
		return row;
	});

export const deleteCategoryRule = createServerFn({ method: "POST" })
	.inputValidator((input: { id: string }) => {
		if (!input?.id || typeof input.id !== "string")
			throw new Error("id required");
		return input;
	})
	.handler(async ({ data }) => {
		await db.delete(categoryRules).where(eq(categoryRules.id, data.id));
	});
