import { sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	institution: text("institution").notNull(),
	accountType: text("account_type").notNull(),
	mask: text("mask"),
	currentBalanceCents: integer("current_balance_cents").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
});

// @ts-expect-error circular reference
export const categories = sqliteTable("categories", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	icon: text("icon"),
	color: text("color"),
	// @ts-expect-error self-reference
	parentId: text("parent_id").references(() => categories.id),
	isSystem: integer("is_system", { mode: "boolean" }).default(false),
	isIncome: integer("is_income", { mode: "boolean" }).default(false),
	excludeFromSpending: integer("exclude_from_spending", {
		mode: "boolean",
	}).default(false),
	budgetCents: integer("budget_cents"),
});

export const transactions = sqliteTable(
	"transactions",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id")
			.notNull()
			.references(() => accounts.id, { onDelete: "cascade" }),
		externalId: text("external_id"),
		amountCents: integer("amount_cents").notNull(),
		date: text("date").notNull(),
		name: text("name").notNull(),
		merchantName: text("merchant_name"),
		categoryId: text("category_id").references(() => categories.id, {
			onDelete: "set null",
		}),
		autoCategorized: integer("auto_categorized", { mode: "boolean" }).default(
			false,
		),
		isPending: integer("is_pending", { mode: "boolean" }).default(false),
		metadata: text("metadata", { mode: "json" }).$type<{
			location?: string;
			paymentChannel?: string;
		}>(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).default(
			sql`(unixepoch())`,
		),
	},
	(table) => ({
		dedupUnique: unique("transactions_dedup").on(
			table.accountId,
			table.externalId,
		),
		accountDateIdx: index("idx_transactions_account_date").on(
			table.accountId,
			table.date,
		),
		categoryDateIdx: index("idx_transactions_category_date").on(
			table.categoryId,
			table.date,
		),
	}),
);

export const categoryRules = sqliteTable("category_rules", {
	id: text("id").primaryKey(),
	categoryId: text("category_id")
		.notNull()
		.references(() => categories.id, { onDelete: "cascade" }),
	matchField: text("match_field", { enum: ["name", "merchant_name"] }).default(
		"name",
	),
	matchType: text("match_type", {
		enum: ["contains", "starts_with", "exact"],
	}).default("contains"),
	matchPattern: text("match_pattern").notNull(),
	priority: integer("priority").notNull().default(0),
	isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
});

export const chatSessions = sqliteTable("chat_sessions", {
	id: text("id").primaryKey(),
	title: text("title"),
	isArchived: integer("is_archived", { mode: "boolean" }).default(false),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
	updatedAt: integer("updated_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
});

export const chatMessages = sqliteTable(
	"chat_messages",
	{
		id: text("id").primaryKey(),
		sessionId: text("session_id")
			.notNull()
			.references(() => chatSessions.id, { onDelete: "cascade" }),
		role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
		content: text("content"),
		toolCalls: text("tool_calls", { mode: "json" }).$type<
			Array<{
				id: string;
				name: string;
				arguments: string;
				result?: unknown;
			}>
		>(),
		toolCallId: text("tool_call_id"),
		createdAt: integer("created_at", { mode: "timestamp" }).default(
			sql`(unixepoch())`,
		),
	},
	(table) => ({
		sessionIdx: index("idx_messages_session").on(
			table.sessionId,
			table.createdAt,
		),
	}),
);

export const todos = sqliteTable("todos", {
	id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).default(
		sql`(unixepoch())`,
	),
});
