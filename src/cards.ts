import { z } from "zod";

const accountSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().nullable().optional(),
  type: z.enum(["BANK", "CREDIT"]),
  subtype: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
});

const billSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  dueDate: z.string().nullable().optional(),
  billClosingDate: z.string().nullable().optional(),
  totalAmount: z.number().finite(),
  totalAmountCurrencyCode: z.string().min(1),
  minimumPaymentAmount: z.number().finite().nullable().optional(),
  allowsInstallments: z.boolean().nullable().optional(),
  payments: z.array(z.unknown()).nullable().optional(),
});

const creditCardMetadataSchema = z.object({
  installmentNumber: z.number().int().positive().nullable().optional(),
  totalInstallments: z.number().int().positive().nullable().optional(),
  totalAmount: z.number().finite().nullable().optional(),
  billId: z.string().min(1).nullable().optional(),
  feeType: z.string().min(1).nullable().optional(),
}).passthrough();

const transactionSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  date: z.string(),
  description: z.string(),
  amount: z.number().finite(),
  currencyCode: z.string().min(1),
  type: z.enum(["DEBIT", "CREDIT"]),
  status: z.enum(["PENDING", "POSTED"]),
  billId: z.string().min(1).nullable().optional(),
  creditCardMetadata: creditCardMetadataSchema.nullable().optional(),
});

type Account = z.infer<typeof accountSchema>;
type Bill = z.infer<typeof billSchema>;
type Transaction = z.infer<typeof transactionSchema>;
type Request = <T>(path: string) => Promise<T>;

type Provenance = "provider" | "derived" | "unavailable";
type Confidence = "high" | "medium" | "low";

export type CardSnapshot = {
  cards: Array<{ account_id: string; item_id: string; name: string | null; last4: string | null }>;
  bills: Array<{
    billId: string;
    account_id: string;
    due_date: string | null;
    closing_date: string | null;
    total_amount_centavos: number;
    currency: string;
    minimum_payment_amount_centavos: number | null;
    allows_installments: boolean | null;
    payments: unknown[];
  }>;
  transactions: Array<{
    id: string;
    account_id: string;
    amount_centavos: number;
    currency: string;
    raw_status: "PENDING" | "POSTED";
    billId: string | null;
    transaction_role: "purchase" | "fee" | "unknown";
    semantic_status: "open_bill" | "due_bill" | "posted_unlinked";
    installment_number: number | null;
    total_installments: number | null;
    total_amount_centavos: number | null;
    installment_group_id: null;
    provenance: { billId: Provenance; transaction_role: Provenance; semantic_status: Provenance; installment: Provenance };
    confidence: { transaction_role: Confidence; semantic_status: Confidence; installment: Confidence };
  }>;
  coverage: { connections: number; cards: number; bills: number; transactions: number; scope: string };
};

function cents(value: number): number { return Math.round(value * 100); }

function last4(number: string | null | undefined): string | null {
  return number?.match(/(\d{4})\D*$/)?.[1] ?? null;
}

function normalizeBill(bill: Bill): CardSnapshot["bills"][number] {
  return {
    billId: bill.id,
    account_id: bill.accountId,
    due_date: bill.dueDate ?? null,
    closing_date: bill.billClosingDate ?? null,
    total_amount_centavos: cents(bill.totalAmount),
    currency: bill.totalAmountCurrencyCode,
    minimum_payment_amount_centavos: bill.minimumPaymentAmount == null ? null : cents(bill.minimumPaymentAmount),
    allows_installments: bill.allowsInstallments ?? null,
    payments: bill.payments ?? [],
  };
}

function normalizeTransaction(transaction: Transaction): CardSnapshot["transactions"][number] {
  const metadata = transaction.creditCardMetadata ?? null;
  const billId = transaction.billId ?? metadata?.billId ?? null;
  const hasInstallmentData = metadata?.installmentNumber != null || metadata?.totalInstallments != null || metadata?.totalAmount != null;
  const transactionRole = metadata?.feeType ? "fee" : transaction.type === "DEBIT" ? "purchase" : "unknown";
  const semanticStatus = transaction.status === "PENDING"
    ? "open_bill"
    : billId
      ? "due_bill"
      : "posted_unlinked";

  return {
    id: transaction.id,
    account_id: transaction.accountId,
    amount_centavos: cents(transaction.amount),
    currency: transaction.currencyCode,
    raw_status: transaction.status,
    billId,
    transaction_role: transactionRole,
    semantic_status: semanticStatus,
    installment_number: metadata?.installmentNumber ?? null,
    total_installments: metadata?.totalInstallments ?? null,
    total_amount_centavos: metadata?.totalAmount == null ? null : cents(metadata.totalAmount),
    installment_group_id: null,
    provenance: {
      billId: billId ? "provider" : "unavailable",
      transaction_role: transactionRole === "unknown" ? "derived" : "provider",
      semantic_status: semanticStatus === "posted_unlinked" ? "derived" : "provider",
      installment: hasInstallmentData ? "provider" : "unavailable",
    },
    confidence: {
      transaction_role: transactionRole === "unknown" ? "low" : "high",
      semantic_status: semanticStatus === "posted_unlinked" ? "medium" : "high",
      installment: hasInstallmentData ? "high" : "low",
    },
  };
}

async function listBills(request: Request, accountId: string): Promise<Bill[]> {
  const page = z.object({ results: z.array(billSchema) }).parse(await request(`/bills?accountId=${encodeURIComponent(accountId)}`));
  return page.results;
}

async function listCurrentTransactions(request: Request, accountId: string, from: string, to: string): Promise<Transaction[]> {
  const params = new URLSearchParams({ accountId, dateFrom: from, dateTo: to });
  let path = `/v2/transactions?${params}`;
  const transactions: Transaction[] = [];
  const seen = new Set<string>();
  for (let page = 0; ; page += 1) {
    if (page >= 200 || seen.has(path)) throw new Error("Paginação de transações de cartão incompleta ou repetida.");
    seen.add(path);
    const payload = z.object({ results: z.array(transactionSchema), next: z.string().nullable().optional() }).parse(await request(path));
    transactions.push(...payload.results.filter(transaction => transaction.accountId === accountId));
    if (!payload.next) return transactions;
    if (!payload.next.startsWith("?")) throw new Error("Cursor de transações de cartão inesperado.");
    path = `/v2/transactions${payload.next}`;
  }
}

async function listBillTransactions(request: Request, billId: string): Promise<Transaction[]> {
  const payload = z.object({ results: z.array(transactionSchema) }).parse(await request(`/bills/${encodeURIComponent(billId)}/transactions`));
  return payload.results;
}

/**
 * Preserva o dado do provedor e só dá uma semântica quando a documentação da
 * Pluggy a garante. Créditos continuam unknown: não há evidência suficiente
 * para escolher entre pagamento, estorno ou outro crédito.
 */
export async function collectCards(request: Request, itemIds: string[], from: string, to: string): Promise<CardSnapshot> {
  const cards: Array<{ account: Account; itemId: string }> = [];
  for (const itemId of itemIds) {
    const accounts = z.object({ results: z.array(accountSchema) }).parse(await request(`/accounts?itemId=${encodeURIComponent(itemId)}`)).results;
    for (const account of accounts) if (account.type === "CREDIT") cards.push({ account, itemId });
  }

  const bills: Bill[] = [];
  const transactions = new Map<string, Transaction>();
  for (const { account } of cards) {
    for (const transaction of await listCurrentTransactions(request, account.id, from, to)) transactions.set(transaction.id, transaction);
    const accountBills = await listBills(request, account.id);
    bills.push(...accountBills);
    for (const bill of accountBills) {
      for (const transaction of await listBillTransactions(request, bill.id)) transactions.set(transaction.id, transaction);
    }
  }

  return {
    cards: cards.map(({ account, itemId }) => ({ account_id: account.id, item_id: account.itemId ?? itemId, name: account.name ?? null, last4: last4(account.number) })),
    bills: bills.map(normalizeBill),
    transactions: [...transactions.values()].map(normalizeTransaction),
    coverage: { connections: itemIds.length, cards: cards.length, bills: bills.length, transactions: transactions.size, scope: "Cartões e faturas disponibilizados pela Pluggy; campos ausentes não são inferidos." },
  };
}
