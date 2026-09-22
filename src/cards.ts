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
  purchaseDate: z.string().nullable().optional(),
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
type BillCoverageReason = "bills_returned" | "bills_outside_period" | "empty_response" | "request_failed";
type NormalizedBill = {
  billId: string;
  account_id: string;
  due_date: string | null;
  closing_date: string | null;
  total_amount_centavos: number;
  currency: string;
  minimum_payment_amount_centavos: number | null;
  allows_installments: boolean | null;
  payments: unknown[];
};

export type CardSnapshot = {
  cards: Array<{
    account_id: string; item_id: string; name: string | null; last4: string | null;
    current_bill: null | { bill_id: string; status: "unknown"; closing_date: string | null; due_date: string | null; total_amount_centavos: number; paid_amount_centavos: null; remaining_amount_centavos: null; source: "provider_bill"; confidence: Confidence };
    next_bill: { bill_id: string | null; due_date: string | null; provider_bill_total_amount_centavos: number | null; projected_amount_centavos: null; observed_open_purchase_subtotal_centavos: number; open_purchase_amount_attribution: "unassigned_without_bill_link"; confirmed_installment_ids: string[]; open_purchase_ids: string[]; unassigned_installment_ids: string[]; confidence: Confidence };
  }>;
  bills: NormalizedBill[];
  bill_coverage_by_card: Array<{
    account_id: string;
    card_last4: string | null;
    bills_supported: boolean | null;
    bills_available: boolean;
    bills_found_total: number;
    bills_found_in_period: number;
    transactions_available: boolean;
    reason: BillCoverageReason;
    reason_if_incomplete: string | null;
    last_sync_at: string | null;
  }>;
  faturas_a_vencer_no_periodo: {
    bills: NormalizedBill[];
    total_por_moeda: Array<{ currency: string; total_amount_centavos: number; bills_count: number }>;
    coverage: { complete: boolean; cards_with_bills: number; cards_without_bills: number; source: "Pluggy Credit Card Bills totalAmount" };
  };
  transactions: Array<{
    id: string;
    account_id: string;
    transaction_date: string;
    date_semantics: "provider_transaction_date" | "provider_transaction_date_semantics_unknown";
    description: string;
    amount_centavos: number;
    currency: string;
    raw_status: "PENDING" | "POSTED";
    provider_status: "PENDING" | "POSTED";
    provider_type: "DEBIT" | "CREDIT";
    bill_id: string | null;
    provider_fee_type: string | null;
    billId: string | null;
    transaction_role: "purchase" | "fee" | "unknown";
    normalized_role: "purchase" | "fee" | "bill_payment" | "refund" | "unknown";
    semantic_status: "open_bill" | "due_bill" | "posted_unlinked" | "future_installment";
    financial_state: "open_bill_purchase" | "current_bill_installment" | "future_installment" | "installment_other_cycle" | "installment_unassigned" | "bill_payment_pending" | "posted_bill_payment" | "posted_bill_purchase" | "posted_unlinked" | "unknown";
    payment_match_id: string | null;
    matched_bank_transaction_id: string | null;
    matched_card_transaction_id: string | null;
    payment_reconciliation_status: "not_bill_payment" | "unmatched" | "ambiguous" | "bank_data_unavailable" | "candidate_card_pending" | "candidate_card_posted";
    payment_duplicate_signal: "none" | "multiple_pending_card_payments_same_day";
    expected_bill_id: string | null;
    expected_bill_month: string | null;
    expected_due_date: string | null;
    billing_cycle_start: string | null;
    billing_cycle_end: string | null;
    installment_number: number | null;
    total_installments: number | null;
    total_amount_centavos: number | null;
    installment_group_id: null;
    provenance: { billId: Provenance; transaction_role: Provenance; normalized_role: Provenance; semantic_status: Provenance; financial_state: Provenance; payment_reconciliation: Provenance; installment: Provenance; expected_bill: Provenance; date_semantics: Provenance };
    confidence: { transaction_role: Confidence; normalized_role: Confidence; semantic_status: Confidence; financial_state: Confidence; payment_reconciliation: Confidence; installment: Confidence; expected_bill: Confidence };
  }>;
  metrics: {
    card_spending: { amount_by_currency: Array<{ currency: string; amount_centavos: number; transaction_count: number }>; confidence: Confidence; source: "card_transactions" };
    bills_due: { amount_by_currency: Array<{ currency: string; amount_centavos: number; bill_count: number }>; coverage_complete: boolean; source: "provider_bills" };
    bill_payments: { card_side_amount_by_currency: Array<{ currency: string; amount_centavos: number; transaction_count: number }>; bank_side_posted_amount_by_currency: Array<{ currency: string; amount_centavos: number; transaction_count: number }>; bank_reconciliation_complete: boolean; note: string };
  };
  bank_transactions: Array<{ id: string; date: string; description: string; amount_centavos: number; currency: string; status: "PENDING" | "POSTED" }>;
  next_bill_estimate: {
    known_amount_by_currency: Array<{ currency: string; amount_centavos: number }>;
    projected_total_by_currency: Array<{ currency: string; amount_centavos: number }> | null;
    confidence: Confidence;
    included_transaction_ids: string[];
    excluded_future_installment_ids: string[];
    excluded_unassigned_installment_ids: string[];
    coverage_complete: boolean;
    reason: string;
  };
  coverage: { connections: number; cards: number; bills: number; transactions: number; scope: string; partial: boolean };
  warnings: string[];
};

function cents(value: number): number { return Math.round(value * 100); }

function last4(number: string | null | undefined): string | null {
  return number?.match(/(\d{4})\D*$/)?.[1] ?? null;
}

function normalizeBill(bill: Bill): NormalizedBill {
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

const feeDescription = /\b(tarifa|anuidade|juros|encargo|iof|taxa|multa)\b/i;
const billPaymentDescription = /\b(pagamento\s+(?:de\s+)?fatura|fatura\s+(?:do\s+)?cart[aã]o|bill\s+payment|statement\s+payment)\b/i;

function normalizeTransaction(transaction: Transaction, billsById: Map<string, NormalizedBill>, from: string, to: string): CardSnapshot["transactions"][number] {
  const metadata = transaction.creditCardMetadata ?? null;
  const billId = transaction.billId ?? metadata?.billId ?? null;
  const hasInstallmentData = metadata?.installmentNumber != null || metadata?.totalInstallments != null || metadata?.totalAmount != null;
  const bill = billId ? billsById.get(billId) ?? null : null;
  const hasInstallmentIdentity = metadata?.installmentNumber != null || metadata?.totalInstallments != null || metadata?.totalAmount != null;
  const explicitBillPayment = transaction.amount < 0 && billPaymentDescription.test(transaction.description);
  const explicitFee = metadata?.feeType != null && feeDescription.test(transaction.description);
  const normalizedRole: CardSnapshot["transactions"][number]["normalized_role"] = explicitBillPayment ? "bill_payment"
    : explicitFee ? "fee"
      : transaction.type === "DEBIT" && transaction.amount > 0 ? "purchase"
        : "unknown";
  const transactionRole: CardSnapshot["transactions"][number]["transaction_role"] = normalizedRole === "fee" ? "fee"
    : normalizedRole === "purchase" ? "purchase" : "unknown";
  const semanticStatus = transaction.status === "PENDING"
    ? (bill && bill.due_date != null && bill.due_date.slice(0, 10) > to && hasInstallmentIdentity ? "future_installment" : "open_bill")
    : billId
      ? "due_bill"
      : "posted_unlinked";
  const linkedBillIsInPeriod = bill?.due_date != null && bill.due_date.slice(0, 10) >= from && bill.due_date.slice(0, 10) <= to;
  const linkedBillIsAfterPeriod = bill?.due_date != null && bill.due_date.slice(0, 10) > to;
  const financialState: CardSnapshot["transactions"][number]["financial_state"] = explicitBillPayment
    ? transaction.status === "PENDING" ? "bill_payment_pending" : "posted_bill_payment"
    : billId && bill && hasInstallmentIdentity && linkedBillIsInPeriod ? "current_bill_installment"
      : billId && bill && hasInstallmentIdentity && linkedBillIsAfterPeriod ? "future_installment"
        : billId && hasInstallmentIdentity && (!bill || bill.due_date == null) ? "unknown"
          : billId && bill && hasInstallmentIdentity ? "installment_other_cycle"
        : !billId && hasInstallmentIdentity ? "installment_unassigned"
            : transaction.status === "PENDING" && transaction.type === "DEBIT" && transaction.amount > 0 ? "open_bill_purchase"
              : billId ? "posted_bill_purchase"
                : transaction.type === "DEBIT" && transaction.amount > 0 ? "posted_unlinked" : "unknown";
  const installmentDateSemanticsUnknown = hasInstallmentData;

  return {
    id: transaction.id,
    account_id: transaction.accountId,
    transaction_date: transaction.date,
    date_semantics: installmentDateSemanticsUnknown ? "provider_transaction_date_semantics_unknown" : "provider_transaction_date",
    description: transaction.description,
    amount_centavos: cents(transaction.amount),
    currency: transaction.currencyCode,
    raw_status: transaction.status,
    provider_status: transaction.status,
    provider_type: transaction.type,
    bill_id: billId,
    provider_fee_type: metadata?.feeType ?? null,
    billId,
    transaction_role: transactionRole,
    normalized_role: normalizedRole,
    semantic_status: semanticStatus,
    financial_state: financialState,
    payment_match_id: null,
    matched_bank_transaction_id: null,
    matched_card_transaction_id: null,
    payment_reconciliation_status: explicitBillPayment ? "unmatched" : "not_bill_payment",
    payment_duplicate_signal: "none",
    expected_bill_id: billId,
    expected_bill_month: bill?.due_date?.slice(0, 7) ?? null,
    expected_due_date: bill?.due_date ?? null,
    billing_cycle_start: null,
    billing_cycle_end: null,
    installment_number: metadata?.installmentNumber ?? null,
    total_installments: metadata?.totalInstallments ?? null,
    total_amount_centavos: metadata?.totalAmount == null ? null : cents(metadata.totalAmount),
    installment_group_id: null,
    provenance: {
      billId: billId ? "provider" : "unavailable",
      transaction_role: transactionRole === "unknown" ? "unavailable" : "derived",
      normalized_role: normalizedRole === "unknown" ? "unavailable" : "derived",
      semantic_status: "derived",
      financial_state: "derived",
      payment_reconciliation: "unavailable",
      installment: hasInstallmentData ? "provider" : "unavailable",
      expected_bill: bill ? "provider" : "unavailable",
      date_semantics: installmentDateSemanticsUnknown ? "unavailable" : "provider",
    },
    confidence: {
      transaction_role: transactionRole === "unknown" ? "low" : metadata?.feeType != null ? "low" : "medium",
      normalized_role: normalizedRole === "unknown" ? "low" : metadata?.feeType != null && !explicitFee ? "low" : "medium",
      semantic_status: "medium",
      financial_state: financialState === "unknown" || financialState === "future_installment" || financialState === "installment_other_cycle" || financialState === "installment_unassigned" ? "low" : "medium",
      payment_reconciliation: "low",
      installment: hasInstallmentData ? "high" : "low",
      expected_bill: bill ? "high" : "low",
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

function dateKey(value: string | null | undefined): string | null {
  const date = value?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function billIsDueInPeriod(bill: Bill, from: string, to: string): boolean {
  const dueDate = dateKey(bill.dueDate);
  return dueDate !== null && dueDate >= from && dueDate <= to;
}

async function mapWithConcurrency<T, R>(values: readonly T[], limit: number, operation: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}

/**
 * Preserva o dado do provedor e só dá uma semântica quando a documentação da
 * Pluggy a garante. Créditos continuam unknown: não há evidência suficiente
 * para escolher entre pagamento, estorno ou outro crédito.
 */
export async function collectCards(request: Request, itemIds: string[], from: string, to: string): Promise<CardSnapshot> {
  const cards: Array<{ account: Account; itemId: string }> = [];
  const bankAccounts: Array<{ account: Account; itemId: string }> = [];
  for (const itemId of itemIds) {
    const accounts = z.object({ results: z.array(accountSchema) }).parse(await request(`/accounts?itemId=${encodeURIComponent(itemId)}`)).results;
    for (const account of accounts) {
      if (account.type === "CREDIT") cards.push({ account, itemId });
      else if (account.type === "BANK") bankAccounts.push({ account, itemId });
    }
  }

  const bills: Bill[] = [];
  const transactions = new Map<string, Transaction>();
  const cardResults = await mapWithConcurrency(cards, 3, async ({ account }) => {
    const warnings: string[] = [];
    let transactionsAvailable = true;
    const currentTransactions = await listCurrentTransactions(request, account.id, from, to).catch(() => {
      transactionsAvailable = false;
      warnings.push(`A Pluggy não disponibilizou transações recentes para o cartão ${last4(account.number) ?? account.id}.`);
      return [] as Transaction[];
    });
    let billsAvailable = true;
    const accountBills = await listBills(request, account.id).catch(() => {
      billsAvailable = false;
      warnings.push(`A Pluggy não disponibilizou Credit Card Bills para o cartão ${last4(account.number) ?? account.id}.`);
      return [] as Bill[];
    });
    if (billsAvailable && accountBills.length === 0) warnings.push(`A Pluggy retornou Bills vazio para o cartão ${last4(account.number) ?? account.id}; suporte e cobertura do período permanecem desconhecidos.`);
    const billTransactions = await Promise.all(accountBills.filter(bill => billIsDueInPeriod(bill, from, to)).map(async bill =>
      listBillTransactions(request, bill.id).catch(() => {
        warnings.push(`A Pluggy não disponibilizou os lançamentos da fatura ${bill.id}.`);
        return [] as Transaction[];
      }),
    ));
    return { account, accountBills, billsAvailable, transactionsAvailable, transactions: [...currentTransactions, ...billTransactions.flat()], warnings };
  });
  const warnings = cardResults.flatMap(result => result.warnings);
  const bankTransactionsResult = await mapWithConcurrency(bankAccounts, 3, async ({ account, itemId }) => {
    try { return { itemId: account.itemId ?? itemId, transactions: await listCurrentTransactions(request, account.id, from, to), available: true }; }
    catch {
      warnings.push(`A Pluggy não disponibilizou transações bancárias para conciliação no período (${last4(account.number) ?? account.id}).`);
      return { itemId: account.itemId ?? itemId, transactions: [] as Transaction[], available: false };
    }
  });
  const bankTransactionsAvailable = bankAccounts.length > 0 && bankTransactionsResult.every(result => result.available);
  const bankTransactions = bankTransactionsResult.flatMap(result => result.transactions
    .filter(transaction => transaction.amount !== 0 && transaction.type === "DEBIT" && transaction.status === "POSTED" && /pagamento\s+(?:de\s+)?cart[aã]o(?:\s+de)?\s+cr[eé]dito/i.test(transaction.description))
    .map(transaction => ({ itemId: result.itemId, transaction })));
  for (const result of cardResults) {
    bills.push(...result.accountBills);
    for (const transaction of result.transactions) transactions.set(transaction.id, transaction);
  }
  const normalizedBills = bills.map(normalizeBill);
  const billsDueInPeriod = normalizedBills.filter(bill => bill.due_date !== null && bill.due_date.slice(0, 10) >= from && bill.due_date.slice(0, 10) <= to);
  const totalsByCurrency = new Map<string, { currency: string; total_amount_centavos: number; bills_count: number }>();
  for (const bill of billsDueInPeriod) {
    const total = totalsByCurrency.get(bill.currency) ?? { currency: bill.currency, total_amount_centavos: 0, bills_count: 0 };
    total.total_amount_centavos += bill.total_amount_centavos;
    total.bills_count += 1;
    totalsByCurrency.set(bill.currency, total);
  }
  const cardsWithBills = cardResults.filter(result => result.accountBills.length > 0).length;
  const cardsWithoutBills = cards.length - cardsWithBills;
  const billCoverageByCard = cardResults.map(({ account, accountBills, billsAvailable, transactionsAvailable }) => {
    const billsInPeriod = accountBills.filter(bill => billIsDueInPeriod(bill, from, to)).length;
    const reason: BillCoverageReason = !billsAvailable ? "request_failed"
      : accountBills.length === 0 ? "empty_response"
        : billsInPeriod === 0 ? "bills_outside_period" : "bills_returned";
    return {
      account_id: account.id,
      card_last4: last4(account.number),
      bills_supported: accountBills.length > 0 ? true : null,
      bills_available: billsAvailable,
      bills_found_total: accountBills.length,
      bills_found_in_period: billsInPeriod,
      transactions_available: transactionsAvailable,
      reason,
      reason_if_incomplete: !billsAvailable ? "Bills API request failed"
        : !transactionsAvailable ? "Card transactions API request failed"
          : accountBills.length === 0 ? "Bills API returned no bills; support and period coverage are unknown"
            : billsInPeriod === 0 ? "Bills returned, but none are due in the requested period" : null,
      last_sync_at: null,
    };
  });
  const billsById = new Map(normalizedBills.map(bill => [bill.billId, bill]));
  const normalizedTransactions = [...transactions.values()].map(transaction => normalizeTransaction(transaction, billsById, from, to));
  const transactionDateInRange = (transaction: CardSnapshot["transactions"][number]) => {
    const date = transaction.transaction_date.slice(0, 10);
    return date >= from && date <= to;
  };
  const reconciliationCandidates = normalizedTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.normalized_role === "bill_payment" && transaction.provider_type === "CREDIT");
  const pendingPaymentsByCardDate = new Map<string, typeof reconciliationCandidates>();
  for (const payment of reconciliationCandidates.filter(row => row.provider_status === "PENDING")) {
    const key = `${payment.account_id}:${payment.transaction_date.slice(0, 10)}:${payment.currency}`;
    pendingPaymentsByCardDate.set(key, [...(pendingPaymentsByCardDate.get(key) ?? []), payment]);
  }
  for (const payments of pendingPaymentsByCardDate.values()) if (payments.length > 1) {
    for (const payment of payments) payment.payment_duplicate_signal = "multiple_pending_card_payments_same_day";
  }
  const bankCandidatesByCardPayment = reconciliationCandidates.map(cardPayment => {
    const itemId = cards.find(card => card.account.id === cardPayment.account_id)?.account.itemId
      ?? cards.find(card => card.account.id === cardPayment.account_id)?.itemId;
    return { cardPayment, banks: bankTransactions.filter(({ itemId: bankItemId, transaction: bank }) => bankItemId === itemId && bank.currencyCode === cardPayment.currency
      && Math.abs(cents(bank.amount)) === Math.abs(cardPayment.amount_centavos)
      && Math.abs(Date.parse(bank.date.slice(0, 10)) - Date.parse(cardPayment.transaction_date.slice(0, 10))) <= 86400000) };
  });
  const candidateBankUse = new Map<string, number>();
  for (const { banks } of bankCandidatesByCardPayment) if (banks.length === 1) candidateBankUse.set(banks[0].transaction.id, (candidateBankUse.get(banks[0].transaction.id) ?? 0) + 1);
  for (const { cardPayment, banks: candidateBanks } of bankCandidatesByCardPayment) {
    if (candidateBanks.length === 1 && candidateBankUse.get(candidateBanks[0].transaction.id) === 1) {
      const matchId = `payment:${candidateBanks[0].transaction.id}:${cardPayment.id}`;
      cardPayment.payment_match_id = matchId;
      cardPayment.matched_bank_transaction_id = candidateBanks[0].transaction.id;
      cardPayment.matched_card_transaction_id = cardPayment.id;
      cardPayment.payment_reconciliation_status = cardPayment.provider_status === "POSTED" ? "candidate_card_posted" : "candidate_card_pending";
      cardPayment.provenance.payment_reconciliation = "derived";
      cardPayment.confidence.payment_reconciliation = "low";
    } else if (candidateBanks.length > 0) {
      cardPayment.payment_reconciliation_status = "ambiguous";
      cardPayment.provenance.payment_reconciliation = "derived";
    } else if (!bankTransactionsAvailable) {
      cardPayment.payment_reconciliation_status = "bank_data_unavailable";
    } else {
      cardPayment.payment_reconciliation_status = "unmatched";
      cardPayment.provenance.payment_reconciliation = "derived";
    }
  }
  const byCurrency = <T extends { currency: string }>(values: T[], value: (row: T) => number) => {
    const totals = new Map<string, { currency: string; amount_centavos: number; transaction_count: number }>();
    for (const row of values) {
      const total = totals.get(row.currency) ?? { currency: row.currency, amount_centavos: 0, transaction_count: 0 };
      total.amount_centavos += value(row);
      total.transaction_count += 1;
      totals.set(row.currency, total);
    }
    return [...totals.values()];
  };
  const purchases = normalizedTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.normalized_role === "purchase" && transaction.financial_state !== "future_installment" && transaction.financial_state !== "installment_unassigned" && transaction.amount_centavos > 0);
  const cardSidePayments = normalizedTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.normalized_role === "bill_payment" && transaction.amount_centavos < 0);
  const candidateOpenPurchases = normalizedTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.financial_state === "open_bill_purchase" && transaction.installment_number == null);
  const excludedFutureInstallments = normalizedTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.financial_state === "future_installment");
  const unassignedInstallments = normalizedTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.financial_state === "installment_unassigned");
  const candidateTotals = new Map<string, number>();
  for (const transaction of candidateOpenPurchases) candidateTotals.set(transaction.currency, (candidateTotals.get(transaction.currency) ?? 0) + transaction.amount_centavos);
  const billsComplete = cardResults.length > 0 && cardResults.every(result => result.billsAvailable && result.accountBills.length > 0);
  const transactionsComplete = cardResults.every(result => result.transactionsAvailable);
  const bankPaymentRecords = bankTransactions.map(({ transaction }) => transaction);
  const bankPaymentTotals = new Map<string, { currency: string; amount_centavos: number; transaction_count: number }>();
  for (const payment of bankPaymentRecords) {
    const total = bankPaymentTotals.get(payment.currencyCode) ?? { currency: payment.currencyCode, amount_centavos: 0, transaction_count: 0 };
    total.amount_centavos += Math.abs(cents(payment.amount)); total.transaction_count += 1; bankPaymentTotals.set(payment.currencyCode, total);
  }

  return {
    cards: cards.map(({ account, itemId }) => {
      const cardBills = normalizedBills.filter(bill => bill.account_id === account.id);
      const currentBill = cardBills.filter(bill => bill.due_date != null && bill.due_date.slice(0, 10) >= from && bill.due_date.slice(0, 10) <= to)
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];
      const nextBill = cardBills.filter(bill => bill.due_date != null && bill.due_date.slice(0, 10) > to)
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))[0];
      const cardTransactions = normalizedTransactions.filter(transaction => transaction.account_id === account.id);
      const openPurchases = cardTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.financial_state === "open_bill_purchase" && transaction.installment_number == null);
      const futureInstallments = cardTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.financial_state === "future_installment" && transaction.expected_bill_id === nextBill?.billId);
      const cardUnassignedInstallments = cardTransactions.filter(transaction => transactionDateInRange(transaction) && transaction.financial_state === "installment_unassigned");
      return {
        account_id: account.id,
        item_id: account.itemId ?? itemId,
        name: account.name ?? null,
        last4: last4(account.number),
        current_bill: currentBill ? {
          bill_id: currentBill.billId,
          status: "unknown" as const,
          closing_date: currentBill.closing_date,
          due_date: currentBill.due_date,
          total_amount_centavos: currentBill.total_amount_centavos,
          paid_amount_centavos: null,
          remaining_amount_centavos: null,
          source: "provider_bill" as const,
          confidence: "high" as const,
        } : null,
        next_bill: {
          bill_id: nextBill?.billId ?? null,
          due_date: nextBill?.due_date ?? null,
          provider_bill_total_amount_centavos: nextBill?.total_amount_centavos ?? null,
          projected_amount_centavos: null,
          observed_open_purchase_subtotal_centavos: openPurchases.reduce((sum, transaction) => sum + transaction.amount_centavos, 0),
          open_purchase_amount_attribution: "unassigned_without_bill_link",
          confirmed_installment_ids: futureInstallments.map(transaction => transaction.id),
          open_purchase_ids: openPurchases.map(transaction => transaction.id),
          unassigned_installment_ids: cardUnassignedInstallments.map(transaction => transaction.id),
          confidence: "low" as const,
        },
      };
    }),
    bills: normalizedBills,
    bill_coverage_by_card: billCoverageByCard,
    faturas_a_vencer_no_periodo: {
      bills: billsDueInPeriod,
      total_por_moeda: [...totalsByCurrency.values()],
      coverage: { complete: billsComplete, cards_with_bills: cardsWithBills, cards_without_bills: cardsWithoutBills, source: "Pluggy Credit Card Bills totalAmount" },
    },
    transactions: normalizedTransactions,
    metrics: {
      card_spending: { amount_by_currency: byCurrency(purchases, row => row.amount_centavos), confidence: transactionsComplete ? "medium" : "low", source: "card_transactions" },
      bills_due: { amount_by_currency: [...totalsByCurrency.values()].map(({ currency, total_amount_centavos, bills_count }) => ({ currency, amount_centavos: total_amount_centavos, bill_count: bills_count })), coverage_complete: billsComplete, source: "provider_bills" },
      bill_payments: { card_side_amount_by_currency: byCurrency(cardSidePayments, row => Math.abs(row.amount_centavos)), bank_side_posted_amount_by_currency: [...bankPaymentTotals.values()], bank_reconciliation_complete: bankTransactionsAvailable, note: "Métricas separadas por origem. Uma conciliação única por valor, moeda e data não prova a quitação da fatura; sem cobertura bancária completa, o estado de conciliação é bank_data_unavailable." },
    },
    bank_transactions: bankTransactions.map(({ itemId, transaction }) => ({ id: transaction.id, item_id: itemId, date: transaction.date, description: transaction.description, amount_centavos: cents(transaction.amount), currency: transaction.currencyCode, status: transaction.status })),
    next_bill_estimate: {
      known_amount_by_currency: [...candidateTotals].map(([currency, amount_centavos]) => ({ currency, amount_centavos })),
      projected_total_by_currency: null,
      confidence: "low",
      included_transaction_ids: candidateOpenPurchases.map(transaction => transaction.id),
      excluded_future_installment_ids: excludedFutureInstallments.map(transaction => transaction.id),
      excluded_unassigned_installment_ids: unassignedInstallments.map(transaction => transaction.id),
      coverage_complete: billsComplete && transactionsComplete,
      reason: "Sem billId, data de vencimento ou ciclo fornecido pela instituição, não é possível atribuir com segurança compras e parcelas pendentes à próxima fatura. O valor conhecido é parcial e não representa o total projetado.",
    },
    coverage: { connections: itemIds.length, cards: cards.length, bills: bills.length, transactions: transactions.size, partial: warnings.length > 0, scope: "Cartões e faturas disponibilizados pela Pluggy; campos ausentes não são inferidos. Lançamentos detalhados de fatura são buscados somente para faturas com vencimento no período solicitado." },
    warnings,
  };
}
