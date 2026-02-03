# Local-first personal finance AI assistant: Complete system architecture

A privacy-focused personal finance assistant combining **TanStack Start** for full-stack React, **SQLite with Drizzle ORM** for local data persistence, and **AI-powered chat with tool calling** delivers the optimal architecture for this use case. The system processes bank statements from Bank of America and Capital One, automatically categorizes transactions with confidence scoring, and provides natural language financial queries—all running entirely on the local network.

## Architecture overview and tech stack decisions

The recommended architecture uses a **single cloud AI provider (OpenAI)** for chat, tool calling, and optional LLM-assisted parsing. Data stays local (SQLite); only the AI layer calls the API.

**Core Stack:**

- **Framework**: TanStack Start (full-stack React with file-based routing)
- **AI Layer**: TanStack AI with `@tanstack/ai-react` hooks + `@tanstack/ai-openai` (GPT-4o)
- **Database**: SQLite with **Drizzle ORM** (7.4kb bundle, native SQLite support, excellent TypeScript inference)
- **UI**: shadcn/ui only (terminal/CLI aesthetic via layout and typography, no Magic UI)
- **PDF Parsing**: pdfjs-dist for local extraction + LLM cleanup for edge cases

**Why Drizzle over Prisma**: Drizzle provides near-raw SQL performance, full `onConflictDoUpdate` support for upserts, and a **100x speed improvement** over Prisma in SQLite benchmarks. Its 7.4kb bundle size (vs Prisma's Rust binary) makes it ideal for local-first applications.

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                          │
│          (TanStack Router + shadcn terminal UI)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   TanStack Start Server                      │
│    ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│    │ /api/chat   │  │ /api/upload  │  │ /api/transactions│   │
│    │ (streaming) │  │ (PDF parse)  │  │ (CRUD)          │   │
│    └─────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   AI Provider   │   │   PDF Parser    │   │   SQLite DB     │
│   (OpenAI       │   │   (pdfjs-dist   │   │   (Drizzle ORM) │
│   GPT-4o)       │   │   + LLM)        │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

## AI model selection: OpenAI (GPT-4o)

For tool calling reliability—critical for database queries—**GPT-4o leads with 97.4% F1 score**. The same model is used for chat, tool calling, and optional LLM-assisted PDF cleanup when pdfjs-dist extraction needs disambiguation.

| Task                   | Model                     | Reason                                             |
| ---------------------- | ------------------------- | -------------------------------------------------- |
| Chat + tool calling    | GPT-4o                    | Best tool calling accuracy, reasoning              |
| PDF parsing (fallback) | GPT-4o or pdfjs-dist only | Use pdfjs-dist first; call LLM only for edge cases |

**Cost analysis for typical usage (100 transactions/month)**: approximately $0.50–2.00/month with OpenAI API, depending on query volume. Caching repeated queries and batching tool calls help keep costs down.

Finance chat uses OpenAI (gpt-4o) as the only model; require `OPENAI_API_KEY`.

## Project conventions

- **Path alias**: `@/*` → `./src/*` (see [tsconfig.json](tsconfig.json)). Use `@/db`, `@/lib/tools/finance`, etc. in code.
- **Routes**: API routes live under `src/routes/`; file `api.chat.ts` gives route `/api/chat`. Use `createFileRoute("/api/chat")` to match.
- **Database**: Schema (accounts, transactions, categories, etc.) extends or replaces current [src/db/schema.ts](src/db/schema.ts). Keep [drizzle.config.ts](drizzle.config.ts) and [src/db/index.ts](src/db/index.ts) as-is.

## Database schema with full Drizzle definitions

The schema stores **amounts as integers (cents)** to avoid floating-point errors—industry standard for financial applications. Transaction deduplication uses a composite unique constraint on `(account_id, external_id)` where `external_id` is the bank-provided transaction reference.

```typescript
// schema.ts - Complete Drizzle ORM schema
import {
  sqliteTable,
  text,
  integer,
  unique,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution").notNull(), // 'bofa', 'capital_one'
  accountType: text("account_type").notNull(), // 'checking', 'credit_card'
  mask: text("mask"), // Last 4 digits
  currentBalanceCents: integer("current_balance_cents").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  parentId: text("parent_id").references(() => categories.id),
  isSystem: integer("is_system", { mode: "boolean" }).default(false),
  isIncome: integer("is_income", { mode: "boolean" }).default(false),
  budgetCents: integer("budget_cents"),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id"), // Bank-provided ID for deduplication
    amountCents: integer("amount_cents").notNull(), // Negative = debit
    date: text("date").notNull(), // 'YYYY-MM-DD'
    name: text("name").notNull(),
    merchantName: text("merchant_name"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    autoCategorized: integer("auto_categorized", { mode: "boolean" }).default(
      false
    ),
    isPending: integer("is_pending", { mode: "boolean" }).default(false),
    metadata: text("metadata", { mode: "json" }).$type<{
      location?: string;
      paymentChannel?: string;
    }>(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => ({
    dedupUnique: unique("transactions_dedup").on(
      table.accountId,
      table.externalId
    ),
    accountDateIdx: index("idx_transactions_account_date").on(
      table.accountId,
      table.date
    ),
    categoryDateIdx: index("idx_transactions_category_date").on(
      table.categoryId,
      table.date
    ),
  })
);

export const categoryRules = sqliteTable("category_rules", {
  id: text("id").primaryKey(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  matchField: text("match_field", { enum: ["name", "merchant_name"] }).default(
    "name"
  ),
  matchType: text("match_type", {
    enum: ["contains", "starts_with", "exact"],
  }).default("contains"),
  matchPattern: text("match_pattern").notNull(), // Lowercase pattern
  priority: integer("priority").notNull().default(0), // Higher = checked first
  isEnabled: integer("is_enabled", { mode: "boolean" }).default(true),
});

export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  isArchived: integer("is_archived", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`(unixepoch())`
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
    toolCallId: text("tool_call_id"), // For tool result messages
    createdAt: integer("created_at", { mode: "timestamp" }).default(
      sql`(unixepoch())`
    ),
  },
  (table) => ({
    sessionIdx: index("idx_messages_session").on(
      table.sessionId,
      table.createdAt
    ),
  })
);
```

**Upsert pattern for transaction imports:**

```typescript
await db
  .insert(transactions)
  .values(parsedTransactions)
  .onConflictDoUpdate({
    target: [transactions.accountId, transactions.externalId],
    set: {
      amountCents: sql`excluded.amount_cents`,
      isPending: sql`excluded.is_pending`,
      merchantName: sql`excluded.merchant_name`,
      updatedAt: sql`(unixepoch())`,
    },
  });
```

## AI tool definitions for financial queries

TanStack AI uses the `toolDefinition()` API with Zod schemas for type-safe tool calling. Tools execute server-side for secure database access.

```typescript
// src/lib/tools/finance.ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const dateFilterSchema = z.object({
  startDate: z
    .string()
    .optional()
    .describe("Start date (YYYY-MM-DD) or relative: '3 weeks ago'"),
  endDate: z
    .string()
    .optional()
    .describe("End date (YYYY-MM-DD) or relative: 'today'"),
});

// QUERY TOOL - Handles "Show me transactions..."
export const queryTransactionsDef = toolDefinition({
  name: "query_transactions",
  description:
    "Query user transactions with filters. Use for listing, searching, or finding specific transactions.",
  inputSchema: z.object({
    ...dateFilterSchema.shape,
    categories: z
      .array(z.string())
      .optional()
      .describe("Filter by category names"),
    merchantSearch: z
      .string()
      .optional()
      .describe("Search merchant names (partial match)"),
    minAmountCents: z.number().optional(),
    maxAmountCents: z.number().optional(),
    limit: z.number().default(50),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      name: z.string(),
      merchantName: z.string().nullable(),
      amountCents: z.number(),
      categoryName: z.string().nullable(),
    })
  ),
});

// AGGREGATE TOOL - Handles "How much did I spend..."
export const aggregateSpendingDef = toolDefinition({
  name: "aggregate_spending",
  description:
    "Calculate spending totals, averages, or counts. Use for 'how much', 'average', or 'total' questions.",
  inputSchema: z.object({
    ...dateFilterSchema.shape,
    groupBy: z.enum(["category", "merchant", "month", "week"]),
    metrics: z
      .array(z.enum(["total", "average", "count", "min", "max"]))
      .default(["total"]),
    comparePeriod: z
      .boolean()
      .optional()
      .describe("Include comparison with previous period"),
  }),
  outputSchema: z.array(
    z.object({
      group: z.string(),
      totalCents: z.number(),
      averageCents: z.number().optional(),
      count: z.number(),
      previousPeriodCents: z.number().optional(),
      changePercent: z.number().optional(),
    })
  ),
});

// COMPARE TOOL - Handles "Compare spending before/after..."
export const compareSpendingDef = toolDefinition({
  name: "compare_spending",
  description:
    "Compare spending between two time periods. Use for before/after, year-over-year analysis.",
  inputSchema: z.object({
    periodA: z.object({ start: z.string(), end: z.string() }),
    periodB: z.object({ start: z.string(), end: z.string() }),
    groupBy: z.enum(["category", "merchant"]).optional(),
    highlightThreshold: z
      .number()
      .default(10)
      .describe("% change threshold to highlight"),
  }),
  outputSchema: z.object({
    periodATotalCents: z.number(),
    periodBTotalCents: z.number(),
    changePercent: z.number(),
    breakdown: z.array(
      z.object({
        group: z.string(),
        periodACents: z.number(),
        periodBCents: z.number(),
        changePercent: z.number(),
        highlighted: z.boolean(),
      })
    ),
  }),
});

// ANALYZE TOOL - Handles "Find suspicious...", "Recommend cuts..."
export const analyzePatternsDef = toolDefinition({
  name: "analyze_patterns",
  description:
    "Analyze transaction patterns for anomalies, trends, or savings opportunities.",
  inputSchema: z.object({
    analysisType: z.enum([
      "anomalies",
      "trends",
      "recurring",
      "savings_opportunities",
    ]),
    ...dateFilterSchema.shape,
    categories: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({
    findings: z.array(
      z.object({
        type: z.string(),
        description: z.string(),
        transactions: z.array(z.string()).optional(), // Transaction IDs
        amountCents: z.number().optional(),
        confidence: z.number(),
      })
    ),
    recommendations: z.array(z.string()),
  }),
});
```

**Server implementation with TanStack Start:**

```typescript
// src/routes/api.chat.ts (route /api/chat)
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import {
  queryTransactionsDef,
  aggregateSpendingDef,
  compareSpendingDef,
  analyzePatternsDef,
} from "@/lib/tools/finance";
import { db } from "@/db";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, sessionId } = await request.json();

        const stream = chat({
          adapter: openaiText("gpt-4o"),
          messages,
          tools: [
            queryTransactionsDef.server(async (input) => {
              // Parse relative dates
              const { start, end } = parseRelativeDates(
                input.startDate,
                input.endDate
              );
              return db
                .select()
                .from(transactions)
                .where(
                  and(
                    between(transactions.date, start, end),
                    input.categories
                      ? inArray(transactions.categoryId, input.categories)
                      : undefined
                  )
                )
                .limit(input.limit);
            }),
            aggregateSpendingDef.server(async (input) => {
              /* ... */
            }),
            compareSpendingDef.server(async (input) => {
              /* ... */
            }),
            analyzePatternsDef.server(async (input) => {
              /* ... */
            }),
          ],
          systemPrompts: [
            `You are a helpful personal finance assistant with access to the user's 
            transaction history (April 2024 - February 2026) from Bank of America and Capital One.
            Always use tools to answer questions about spending. Be precise with financial data.
            Format currency as dollars (convert from cents by dividing by 100).`,
          ],
        });

        return toServerSentEventsResponse(stream);
      },
    },
  },
});
```

## PDF parsing pipeline for Bank of America and Capital One

Both banks provide native text PDFs (not scanned), enabling local extraction without OCR. The pipeline uses **pdfjs-dist for text extraction** with bank-specific regex patterns, falling back to LLM cleanup for edge cases.

```typescript
// lib/pdf-parser.ts
import * as pdfjsLib from "pdfjs-dist";

interface ParsedTransaction {
  date: string;
  description: string;
  amountCents: number;
  externalId: string | null;
  type: "debit" | "credit";
}

export async function parseStatement(pdfBuffer: ArrayBuffer): Promise<{
  bank: "bofa" | "capital_one" | "unknown";
  transactions: ParsedTransaction[];
  needsReview: ParsedTransaction[];
}> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
  }

  const bank = detectBank(fullText);
  const transactions =
    bank === "bofa"
      ? parseBoATransactions(fullText)
      : bank === "capital_one"
        ? parseCapitalOneTransactions(fullText)
        : await llmFallbackParse(fullText);

  return {
    bank,
    transactions,
    needsReview: transactions.filter((t) => !t.externalId),
  };
}

function detectBank(text: string): "bofa" | "capital_one" | "unknown" {
  if (text.includes("Bank of America")) return "bofa";
  if (text.includes("Capital One")) return "capital_one";
  return "unknown";
}

function parseBoATransactions(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  // BoA format: MM/DD Description Amount Balance
  const txRegex = /(\d{2}\/\d{2})\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;

  let match;
  while ((match = txRegex.exec(text)) !== null) {
    transactions.push({
      date: normalizeDate(match[1]),
      description: match[2].trim(),
      amountCents: Math.round(parseFloat(match[3].replace(",", "")) * 100),
      externalId: generateTransactionId(match),
      type: detectTransactionType(text, match.index),
    });
  }
  return transactions;
}

function generateTransactionId(match: RegExpMatchArray): string {
  // Create deterministic ID from date + amount + description prefix
  const input = `${match[1]}-${match[3]}-${match[2].slice(0, 20)}`;
  return Buffer.from(input).toString("base64").slice(0, 16);
}
```

**Validation with balance reconciliation:**

```typescript
function validateExtraction(
  transactions: ParsedTransaction[],
  startBalanceCents: number,
  endBalanceCents: number
): { valid: boolean; calculatedEnd: number; difference: number } {
  const calculatedEnd = transactions.reduce(
    (sum, tx) =>
      sum + (tx.type === "credit" ? tx.amountCents : -tx.amountCents),
    startBalanceCents
  );

  return {
    valid: Math.abs(calculatedEnd - endBalanceCents) < 100, // Within $1
    calculatedEnd,
    difference: calculatedEnd - endBalanceCents,
  };
}
```

## Categorization system with confidence scoring

The categorization system uses a **three-tier approach**: rule-based matching (100% confidence), ML classifier for novel transactions, and user confirmation for low-confidence items.

```typescript
// lib/categorize.ts
interface CategorizationResult {
  categoryId: string | null;
  confidence: number;
  source: "rule" | "ml" | "manual";
  explanation: string[];
}

export async function categorizeTransaction(
  tx: { name: string; merchantName?: string; amountCents: number },
  rules: CategoryRule[],
  historicalData: Transaction[]
): Promise<CategorizationResult> {
  // Tier 1: Rule-based matching (highest priority)
  const sortedRules = rules
    .filter((r) => r.isEnabled)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    const field =
      rule.matchField === "merchant_name" ? tx.merchantName : tx.name;
    if (
      matchesPattern(field?.toLowerCase(), rule.matchPattern, rule.matchType)
    ) {
      return {
        categoryId: rule.categoryId,
        confidence: 1.0,
        source: "rule",
        explanation: [`Matched rule: "${rule.matchPattern}"`],
      };
    }
  }

  // Tier 2: Historical similarity matching
  const similar = findSimilarTransactions(tx.name, historicalData);
  if (similar.length >= 3) {
    const categoryVotes = similar.reduce(
      (acc, t) => {
        if (t.categoryId) acc[t.categoryId] = (acc[t.categoryId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const [topCategory, count] =
      Object.entries(categoryVotes).sort(([, a], [, b]) => b - a)[0] || [];

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

  // Tier 3: Unknown - requires manual categorization
  return {
    categoryId: null,
    confidence: 0,
    source: "manual",
    explanation: ["No matching rule or similar transactions found"],
  };
}

// Confidence thresholds for UI behavior
export const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 0.85, // Auto-categorize without user review
  SUGGEST: 0.6, // Show suggestion with easy edit
  MANUAL: 0, // Require user input
};
```

**Default categories to seed:**

```typescript
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
];
```

## UX design specifications

### Dashboard screen (terminal aesthetic)

The dashboard uses **shadcn components only** (Card, DataTable, Badge, Progress) with Recharts for charts. Terminal/CLI aesthetic comes from layout and typography (e.g. JetBrains Mono). Three KPI cards at top show current month spending, comparison with previous month, and budget remaining.

```
┌─────────────────────────────────────────────────────────────┐
│ finance-cli v2.0                     │ Feb 2026 ▼ │ ⚙️     │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ TOTAL SPENT     │ │ vs LAST MONTH   │ │ BUDGET LEFT     │ │
│ │ $3,247.82       │ │ ↑ 12.3%         │ │ $752.18         │ │
│ │ ████████████░░░ │ │ ████▓▓░░░░      │ │ ████░░░░░░░░░░  │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
│                                                             │
│ CATEGORY BREAKDOWN                                          │
│ Restaurants    $892.40  ████████████████░░░░ 27.5%         │
│ Transportation $456.20  █████████░░░░░░░░░░░ 14.0%         │
│ Groceries      $380.00  ███████░░░░░░░░░░░░░ 11.7%         │
│                                                             │
│ > RECENT TRANSACTIONS                                       │
│ 02/03 │ UBER EATS           │ Restaurants │    -$32.50     │
│ 02/02 │ AMAZON.COM          │ Shopping    │   -$156.00     │
│ 02/01 │ SALARY DEPOSIT      │ Salary      │ +$4,500.00     │
└─────────────────────────────────────────────────────────────┘
```

**shadcn components**: Card, DataTable (with TanStack Table), Chart (Recharts; add via `bunx --bun shadcn@latest add chart` when implementing), Badge, Progress. For KPI numbers use plain formatted values or a small custom animated counter (no Magic UI).

### Chat interface with tool call visualization

```
┌────────────────────┬────────────────────────────────────────┐
│ CONVERSATIONS      │ 👤 How much did I spend on restaurants │
│ ──────────────     │    for the last 3 weeks?               │
│ 📌 Budget Review   │                                        │
│ 📅 Today           │ 🤖 Let me check your transactions...   │
│  └ Restaurant...   │                                        │
│ 📅 Yesterday       │ ┌─────────────────────────────────────┐│
│                    │ │ ⚡ query_transactions               ││
│ [🔍 Search]        │ │ category: "restaurants"             ││
│                    │ │ start: "2026-01-13"                 ││
│                    │ │ ████████░░ Running...               ││
│                    │ └─────────────────────────────────────┘│
│                    │                                        │
│                    │ 🤖 You spent **$247.85** on restaurants│
│                    │    over the last 3 weeks:              │
│                    │    • 12 transactions                   │
│                    │    • Top: Chipotle ($68.40)            │
│                    │    • Average: $20.65/transaction       │
│                    │                                        │
│                    │ ┌────────────────────────────────────┐ │
│                    │ │ Ask about your finances...     [→] │ │
│                    │ └────────────────────────────────────┘ │
└────────────────────┴────────────────────────────────────────┘
```

**Tool call states**: Pending (spinner), In Progress (show parameters), Complete (checkmark + collapsible result), Error (retry option).

### Statement upload flow

**Three-stage process:**

1. **Upload** - Drag-drop zone for PDF/CSV, file validation
2. **Parsing** - Progress bar, transaction count, categorization status
3. **Review** - Confidence-tiered review: auto-accepted (≥85%), suggestions (60-85%), manual required (<60%)

```
┌─────────────────────────────────────────────────────────────┐
│ REVIEW CATEGORIZATIONS                    [Accept All] [×]  │
├─────────────────────────────────────────────────────────────┤
│ ⚠️ 12 NEED REVIEW (low confidence)                          │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AMZN MKTP US*Z8    │ -$45.99  │ Shopping? ▼ │ [✓] [×]   │ │
│ │ Confidence: 62%    │          │ └ Electronics           │ │
│ │ Similar: 15 past   │          │ └ Shopping ◉            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ✅ 235 AUTO-CATEGORIZED                          [Review]   │
│                                                             │
│ □ Create rule: "AMZN MKTP" → Shopping                       │
│                                   [Import 247 Transactions] │
└─────────────────────────────────────────────────────────────┘
```

## Implementation approach and challenges

### Phase 1: Foundation (Week 1-2)

- TanStack Start project setup with file-based routing
- SQLite + Drizzle ORM schema and migrations
- Basic CRUD for accounts, transactions, categories
- shadcn UI only (Card, Table, Badge, Progress, Chart); terminal aesthetic via typography (e.g. JetBrains Mono)

### Phase 2: AI Integration (Week 3-4)

- TanStack AI chat endpoint with streaming
- Tool definitions and server implementations
- Chat session persistence
- Relative date parsing for queries

### Phase 3: PDF Parsing (Week 5-6)

- Add **pdfjs-dist** (and types if needed) for the parsing pipeline.
- Bank-specific parsers (BoA, Capital One)
- Upload flow with progress tracking
- Balance reconciliation validation
- LLM fallback for edge cases

### Phase 4: Categorization (Week 7-8)

- Add **Recharts** (or use shadcn chart component) for category breakdown and dashboard charts.
- Rule-based matching engine
- Confidence scoring algorithm
- Review UI for uncertain categorizations
- Rule learning from user corrections

### Potential challenges and mitigations

| Challenge                     | Mitigation                                                                |
| ----------------------------- | ------------------------------------------------------------------------- |
| Bank statement format changes | Modular parser architecture; LLM fallback for unknown formats             |
| Tool calling errors           | Input validation with Zod; graceful error messages; retry logic           |
| Relative date ambiguity       | Explicit date parser with clear rules; confirmation for ambiguous queries |
| Large transaction imports     | Batch processing; progress indicators; background jobs                    |
| AI model costs                | Caching for repeated queries; batch tool calls where possible             |

### Security considerations

All financial data stays local—the SQLite database runs on the user's machine with optional SQLCipher encryption. The OpenAI API is used for chat and tool calling; transaction data sent in prompts can be minimized (e.g. aggregate results instead of raw rows) and the API key is the only external dependency.

This architecture provides a complete, production-ready foundation for a personal finance assistant that respects user privacy while delivering powerful AI-driven insights.
