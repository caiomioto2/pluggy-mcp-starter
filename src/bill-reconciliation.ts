import { z } from "zod";

// Preserve provider metadata, including conversion fields, without interpreting
// conversions whose semantics are not documented.
export const paymentSchema = z.object({
  id: z.string().min(1), amount: z.number().finite().nonnegative(),
  currencyCode: z.string().min(1), paymentDate: z.iso.datetime({ local: true, offset: true }),
  valueType: z.string().min(1), paymentMode: z.string().min(1),
}).passthrough();
export const chargeSchema = z.object({
  id: z.string().min(1), type: z.string().min(1),
  amount: z.number().finite().nonnegative(), currencyCode: z.string().min(1),
}).passthrough();

export type Reconciliation = {
  status: "unknown" | "settled" | "partial" | "unpaid";
  paid_amount_centavos: number | null;
  finance_charges_centavos: number | null;
  remaining_amount_centavos: number | null;
  source: "provider_bill_next_cycle";
  confidence: "high" | "low";
  as_of: string;
  reference_due_date: string | null;
  bill_ids: string[];
  payment_ids: string[];
  charge_ids: string[];
  reason: string | null;
};
export type ReconcilableBill = {
  billId: string; account_id: string; due_date: string | null;
  currency: string; total_amount_centavos: number;
  payments: z.infer<typeof paymentSchema>[] | null;
  finance_charges: z.infer<typeof chargeSchema>[] | null;
};

const day = (value: string | null) => value?.slice(0, 10) ?? null;
const month = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
const cents = (amount: number) => Math.round(amount * 100);

/** A closed, consecutive N+1 is required; missing evidence never means zero.
 * The result is a snapshot of the provider cycles, not a real-time debt balance.
 * Bank/card transaction candidates never enter this calculation.
 */
export function reconcileBill(bill: ReconcilableBill, all: ReconcilableBill[], asOf: string): Reconciliation {
  const result: Reconciliation = {
    status: "unknown", paid_amount_centavos: null, finance_charges_centavos: null,
    remaining_amount_centavos: null, source: "provider_bill_next_cycle", confidence: "low",
    as_of: asOf, reference_due_date: null, bill_ids: [bill.billId], payment_ids: [], charge_ids: [], reason: null,
  };
  const unknown = (reason: string) => ({ ...result, reason });
  const due = day(bill.due_date);
  if (!due) return unknown("missing_due_date");
  const accountBills = all.filter(row => row.account_id === bill.account_id);
  if (accountBills.some(row => !row.due_date)) return unknown("unknown_cycle_order");
  if (accountBills.filter(row => month(day(row.due_date)!) === month(due)).length !== 1) return unknown("ambiguous_cycle");
  const successors = accountBills.filter(row => month(day(row.due_date)!) === month(due) + 1);
  if (successors.length !== 1) return unknown(successors.length ? "ambiguous_next_cycle" : "missing_next_cycle");
  const next = successors[0];
  result.bill_ids.push(next.billId);
  result.reference_due_date = next.due_date;
  if (day(next.due_date)! > asOf.slice(0, 10)) return unknown("next_cycle_not_due_yet");
  if (next.currency !== bill.currency) return unknown("currency_mismatch");
  if (next.payments == null || next.finance_charges == null) return unknown("missing_payment_or_charge_evidence");
  if ([...next.payments, ...next.finance_charges].some(row => row.currencyCode !== bill.currency)) return unknown("currency_mismatch");
  const conflictingIds = <T extends { id: string }>(rows: T[]) => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      const value = JSON.stringify(row);
      if (seen.has(row.id) && seen.get(row.id) !== value) return true;
      seen.set(row.id, value);
    }
    return false;
  };
  if (conflictingIds(next.payments) || conflictingIds(next.finance_charges)) return unknown("conflicting_duplicate_evidence");
  const payments = [...new Map(next.payments.map(row => [row.id, row])).values()];
  const charges = [...new Map(next.finance_charges.map(row => [row.id, row])).values()];
  if (payments.some(payment => accountBills.some(row => row.billId !== next.billId && row.payments?.some(other => other.id === payment.id)))) return unknown("payment_reused_across_cycles");
  if (payments.some(payment => day(payment.paymentDate)! < due || day(payment.paymentDate)! > day(next.due_date)! || day(payment.paymentDate)! > asOf.slice(0, 10))) return unknown("payment_date_outside_cycle");
  const paid = payments.reduce((sum, row) => sum + cents(row.amount), 0);
  const fees = charges.reduce((sum, row) => sum + cents(row.amount), 0);
  const remaining = bill.total_amount_centavos + fees - paid;
  if (![paid, fees, remaining, bill.total_amount_centavos].every(Number.isSafeInteger) || bill.total_amount_centavos < 0) return unknown("unsupported_amount");
  if (remaining < 0) return unknown("overpayment_attribution_uncertain");
  return { ...result, status: remaining === 0 ? "settled" : paid > 0 ? "partial" : "unpaid",
    paid_amount_centavos: paid, finance_charges_centavos: fees, remaining_amount_centavos: remaining,
    confidence: "high", payment_ids: payments.map(row => row.id), charge_ids: charges.map(row => row.id), reason: null };
}
