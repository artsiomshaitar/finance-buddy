import { db } from "@/db";
import { categories } from "@/db/schema";

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
];

export async function seedCategoriesIfEmpty(): Promise<void> {
	const existing = await db.select().from(categories).limit(1);
	if (existing.length > 0) return;
	await db.insert(categories).values(DEFAULT_CATEGORIES);
}
