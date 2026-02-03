import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";

const TRANSFER_CATEGORY = {
	id: "transfer",
	name: "Transfer",
	icon: "↔️",
	isIncome: false,
	isSystem: true,
	excludeFromSpending: true,
};

const DEFAULT_CATEGORIES = [
	{ id: "salary", name: "Salary", icon: "💰", isIncome: true, isSystem: true },
	{ id: "rent", name: "Rent", icon: "🏠", isSystem: true },
	{ id: "utilities", name: "Utilities", icon: "💡", isSystem: true },
	{ id: "groceries", name: "Groceries", icon: "🛒", isSystem: true },
	{ id: "shopping", name: "Shopping", icon: "🛍️", isSystem: true },
	{ id: "restaurants", name: "Restaurants", icon: "🍔", isSystem: true },
	{ id: "internet", name: "Internet", icon: "🌐", isSystem: true },
	{ id: "phone", name: "Phone", icon: "📱", isSystem: true },
	{ id: "transportation", name: "Transportation", icon: "🚗", isSystem: true },
	{ id: "entertainment", name: "Entertainment", icon: "🎬", isSystem: true },
	{ id: "miscellaneous", name: "Miscellaneous", icon: "🤷‍♂️", isSystem: true },
	{ id: "subscriptions", name: "Subscriptions", icon: "📺", isSystem: false },
	{ id: "travel", name: "Travel", icon: "🛫", isSystem: false },
	TRANSFER_CATEGORY,
];

export async function seedCategoriesIfEmpty(): Promise<void> {
	const existing = await db.select().from(categories).limit(1);
	if (existing.length === 0) {
		await db.insert(categories).values(DEFAULT_CATEGORIES);
		return;
	}
	const transferExists = await db
		.select()
		.from(categories)
		.where(eq(categories.id, TRANSFER_CATEGORY.id))
		.limit(1);
	if (transferExists.length === 0) {
		await db.insert(categories).values(TRANSFER_CATEGORY);
	}
}
