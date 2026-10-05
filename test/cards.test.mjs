import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectCards } from '../dist/cards.js';
import { PluggyHttpError } from '../dist/pluggy-errors.js';

// Verbatim Bill example from /en/reference/bill/bills-list, read 2026-10-05.
const officialBill = JSON.parse(await readFile(new URL('./fixtures/official-bill.json', import.meta.url)));
const payment = (amount = 512.5, overrides = {}) => ({ id: 'payment-1', amount, currencyCode: 'BRL', paymentDate: '2026-02-10T00:00:00Z', valueType: 'FULL_PAYMENT', paymentMode: 'PIX', ...overrides });
const charge = (amount = 12.5, overrides = {}) => ({ id: 'charge-1', type: 'IOF', amount, currencyCode: 'BRL', ...overrides });
const bill = (id, dueDate, overrides = {}) => ({ id, dueDate, totalAmount: 500, totalAmountCurrencyCode: 'BRL', payments: [], financeCharges: [], ...overrides });
const january = () => bill('jan', '2026-01-10');
const february = (overrides = {}) => bill('feb', '2026-02-10', { payments: [payment()], financeCharges: [charge()], ...overrides });
const transaction = (id, overrides = {}) => ({ id, accountId: 'card', date: '2026-01-10T00:00:00Z', description: 'Pagamento recebido', amount: -512.5, currencyCode: 'BRL', type: 'CREDIT', status: 'POSTED', ...overrides });

async function snapshot({ bills = [january(), february()], accounts, transactions = [], bankTransactions = [], from = '2026-01-01', to = '2026-01-31', asOf = '2026-03-01T00:00:00Z', handle } = {}) {
  const paths = [];
  const request = async path => {
    paths.push(path);
    if (handle) {
      const result = await handle(path);
      if (result !== undefined) return result;
    }
    const url = new URL(path, 'https://fixture.invalid');
    if (url.pathname === '/accounts') return { results: accounts ?? [{ id: 'card', type: 'CREDIT', balance: 999, currencyCode: 'BRL' }] };
    if (url.pathname === '/bills') return { results: bills, page: 1, totalPages: 1 };
    if (url.pathname === '/v2/transactions') return { results: url.searchParams.get('accountId') === 'bank' ? bankTransactions : transactions, next: null };
    if (url.pathname === '/transactions') return { results: [], page: 1, totalPages: 1 };
    throw new Error('Unexpected fixture endpoint');
  };
  return { result: await collectCards(request, ['item'], from, to, asOf), paths };
}

test('official Bill without accountId is linked to request context, preserving typed evidence', async () => {
  const { result } = await snapshot({ bills: [officialBill], from: '2023-07-01', to: '2023-07-31' });
  assert.equal(result.bills.length, 1);
  assert.equal(result.bills[0].account_id, 'card');
  assert.deepEqual(result.bills[0].payments, officialBill.payments);
  assert.deepEqual(result.bills[0].finance_charges, officialBill.financeCharges);
  assert.equal(result.bill_coverage_by_card[0].reason, 'bills_returned');
  assert.equal(result.cards[0].total_used.amount_centavos, 99900);
  assert.equal(result.cards[0].current_bill.total_amount_centavos, 5000000);
});

test('Bills and public billId transactions traverse all pages, independent of transaction dates', async () => {
  const { result, paths } = await snapshot({ handle: path => {
    const url = new URL(path, 'https://fixture.invalid');
    if (url.pathname === '/bills') {
      const page = Number(url.searchParams.get('page') ?? 1);
      return { page, totalPages: 2, results: page === 1 ? [january()] : [february()] };
    }
    if (url.pathname === '/transactions') {
      const page = Number(url.searchParams.get('page'));
      return { page, totalPages: 2, results: [transaction('linked-' + page, { billId: 'jan', date: '2025-12-01T00:00:00Z', amount: 50, type: 'DEBIT' })] };
    }
  }});
  assert.equal(result.bills.length, 2);
  assert.deepEqual(result.transactions.map(row => row.id), ['linked-1', 'linked-2']);
  assert.ok(paths.includes('/bills?accountId=card&page=2'));
  assert.ok(paths.includes('/transactions?accountId=card&billId=jan&page=2'));
  assert.equal(paths.some(path => path.startsWith('/bills/')), false);
});

test('HTTP, auth, rate limit, schema, empty response and transport failures remain distinct and sanitized', async () => {
  for (const [error, reason, status] of [[new PluggyHttpError(500, 'secret-code', 'secret-body'), 'http_failed', 500], [new PluggyHttpError(403, undefined, 'secret-token'), 'authorization_failed', 403], [new PluggyHttpError(429, undefined, 'secret-token'), 'rate_limited', 429], [new Error('secret-token'), 'request_failed', null]]) {
    const { result } = await snapshot({ handle: path => { if (path.startsWith('/bills?')) throw error; } });
    const coverage = result.bill_coverage_by_card[0];
    assert.equal(coverage.reason, reason);
    assert.equal(coverage.diagnostic.http_status, status);
    assert.equal(coverage.bills_supported, null);
    assert.equal(JSON.stringify(result).includes('secret-'), false);
  }
  const { result: invalid } = await snapshot({ bills: [{ ...january(), totalAmount: 'secret-financial-value' }] });
  assert.equal(invalid.bill_coverage_by_card[0].reason, 'validation_failed');
  assert.deepEqual(invalid.bill_coverage_by_card[0].diagnostic.schema_issues, [{ path: 'results.0.totalAmount', code: 'invalid_type' }]);
  assert.equal(JSON.stringify(invalid).includes('secret-financial-value'), false);
  const { result: empty } = await snapshot({ bills: [] });
  assert.equal(empty.bill_coverage_by_card[0].reason, 'empty_response');
  assert.equal(empty.remaining_balance.coverage_complete, false);
  assert.deepEqual(empty.remaining_balance.amount_by_currency, []);
});

test('contradictory accountId and repeated/incomplete pagination are validation failures', async () => {
  const { result: wrong } = await snapshot({ bills: [{ ...january(), accountId: 'other-card' }] });
  assert.equal(wrong.bill_coverage_by_card[0].reason, 'validation_failed');
  assert.equal(wrong.bills.length, 0);
  for (const handle of [() => ({ page: 1, totalPages: 2, results: [january()] }), path => ({ page: path.includes('page=2') ? 2 : 1, totalPages: 2, results: path.includes('page=2') ? [] : [january()] })]) {
    const { result } = await snapshot({ handle: path => path.startsWith('/bills?') ? handle(path) : undefined });
    assert.equal(result.bill_coverage_by_card[0].reason, 'validation_failed');
    assert.equal(result.bills.length, 0);
  }
});

test('official 500 + 12.50 = 512.50 next-cycle example settles Bill N with provenance', async () => {
  const { result } = await snapshot();
  const current = result.cards[0].current_bill;
  assert.equal(current.status, 'settled');
  assert.equal(current.paid_amount_centavos, 51250);
  assert.equal(current.finance_charges_centavos, 1250);
  assert.equal(current.remaining_amount_centavos, 0);
  assert.deepEqual(current.reconciliation.bill_ids, ['jan', 'feb']);
  assert.deepEqual(current.reconciliation.payment_ids, ['payment-1']);
  assert.equal(current.reconciliation.as_of, '2026-03-01T00:00:00Z');
  assert.equal(result.remaining_balance.coverage_complete, true);
  assert.deepEqual(result.remaining_balance.amount_by_currency, [{ currency: 'BRL', amount_centavos: 0, bills_count: 1 }]);
});

test('partial and unpaid closed-cycle snapshots use only complete next-cycle evidence', async () => {
  for (const [payments, remaining, status] of [[[payment(200)], 31250, 'partial'], [[], 51250, 'unpaid']]) {
    const { result } = await snapshot({ bills: [january(), february({ payments })] });
    assert.equal(result.cards[0].current_bill.remaining_amount_centavos, remaining);
    assert.equal(result.cards[0].current_bill.status, status);
  }
});

test('missing, future, nonconsecutive, ambiguous or currency-incompatible cycles return null with reason', async () => {
  const cases = [
    [[january()], 'missing_next_cycle'],
    [[january(), february({ payments: null })], 'missing_payment_or_charge_evidence'],
    [[january(), february({ financeCharges: null })], 'missing_payment_or_charge_evidence'],
    [[january(), february({ dueDate: '2026-03-10' })], 'missing_next_cycle'],
    [[january(), february(), february({ id: 'feb-2' })], 'ambiguous_next_cycle'],
    [[january(), february({ payments: [payment(512.5, { currencyCode: 'USD' })] })], 'currency_mismatch'],
    [[january(), february({ totalAmountCurrencyCode: 'USD' })], 'currency_mismatch'],
    [[january(), february({ payments: [payment(600)] })], 'overpayment_attribution_uncertain'],
  ];
  for (const [bills, reason] of cases) {
    const { result } = await snapshot({ bills });
    assert.equal(result.cards[0].current_bill.remaining_amount_centavos, null, reason);
    assert.equal(result.cards[0].current_bill.reconciliation.reason, reason);
    assert.equal(result.remaining_balance.coverage_complete, false);
  }
  const { result } = await snapshot({ asOf: '2026-02-01T00:00:00Z' });
  assert.equal(result.cards[0].current_bill.reconciliation.reason, 'next_cycle_not_due_yet');
});

test('same-Bill payments never pay that Bill; duplicate evidence is counted once or rejected', async () => {
  const { result: same } = await snapshot({ bills: [january(), february()], from: '2026-02-01', to: '2026-02-28' });
  assert.equal(same.cards[0].current_bill.remaining_amount_centavos, null);
  const { result: duplicate } = await snapshot({ bills: [january(), february({ payments: [payment(), payment()], financeCharges: [charge(), charge()] })] });
  assert.equal(duplicate.cards[0].current_bill.remaining_amount_centavos, 0);
  const { result: conflict } = await snapshot({ bills: [january(), february({ payments: [payment(), payment(200)] })] });
  assert.equal(conflict.cards[0].current_bill.reconciliation.reason, 'conflicting_duplicate_evidence');
  const { result: reused } = await snapshot({ bills: [january(), february(), bill('mar', '2026-03-10', { payments: [payment()] })] });
  assert.equal(reused.cards[0].current_bill.reconciliation.reason, 'payment_reused_across_cycles');
});

test('operationType identifies Pagamento recebido and bank description; multiple sources never subtract twice', async () => {
  const { result } = await snapshot({
    accounts: [{ id: 'card', type: 'CREDIT' }, { id: 'bank', type: 'BANK' }],
    transactions: [transaction('card-payment', { operationType: 'PAGAMENTO_FATURA' }), transaction('unknown-credit', { description: 'Estorno desconhecido' })],
    bankTransactions: [transaction('bank-payment', { accountId: 'bank', amount: 512.5, type: 'DEBIT', description: 'Pagamento de fatura Cartão de crédito' })],
  });
  assert.equal(result.transactions[0].normalized_role, 'bill_payment');
  assert.equal(result.transactions[0].provenance.normalized_role, 'provider');
  assert.equal(result.transactions[0].confidence.normalized_role, 'high');
  assert.equal(result.transactions[1].normalized_role, 'unknown');
  assert.equal(result.metrics.bill_payments.bank_side_posted_amount_by_currency[0].amount_centavos, 51250);
  assert.equal(result.cards[0].current_bill.paid_amount_centavos, 51250);
  assert.equal(result.cards[0].current_bill.remaining_amount_centavos, 0);
});

test('PENDING alone, missing Bills and unlinked installments keep coverage partial', async () => {
  const { result } = await snapshot({ bills: [], transactions: [transaction('pending', { status: 'PENDING' }), transaction('installment', { amount: 50, type: 'DEBIT', status: 'PENDING', creditCardMetadata: { installmentNumber: 2, totalInstallments: 3 } })] });
  assert.equal(result.transactions[0].normalized_role, 'unknown');
  assert.equal(result.transactions[1].financial_state, 'installment_unassigned');
  assert.equal(result.cards[0].current_bill, null);
  assert.equal(result.remaining_balance.coverage_complete, false);
  assert.deepEqual(result.next_bill_estimate.excluded_unassigned_installment_ids, ['installment']);
});

test('currency totals remain separate and a card without Bills prevents complete coverage', async () => {
  const { result } = await snapshot({ accounts: [{ id: 'card', type: 'CREDIT' }, { id: 'usd', type: 'CREDIT' }, { id: 'empty', type: 'CREDIT' }], handle: path => {
    if (path === '/bills?accountId=empty') return { results: [], page: 1, totalPages: 1 };
    if (path === '/bills?accountId=usd') return { results: [january(), february()].map(row => ({ ...row, id: 'usd-' + row.id, totalAmountCurrencyCode: 'USD', payments: row.payments.map(p => ({ ...p, id: 'usd-' + p.id, currencyCode: 'USD' })), financeCharges: row.financeCharges.map(c => ({ ...c, currencyCode: 'USD' })) })), page: 1, totalPages: 1 };
  }});
  assert.deepEqual(result.remaining_balance.amount_by_currency.map(row => row.currency), ['BRL', 'USD']);
  assert.equal(result.remaining_balance.coverage_complete, false);
  assert.deepEqual(result.remaining_balance.cards_without_bills, ['empty']);
});

test('bill transaction failures mark transaction coverage incomplete without discarding valid Bills', async () => {
  const { result } = await snapshot({ handle: path => { if (path.startsWith('/transactions?')) throw new PluggyHttpError(404, undefined, 'secret-body'); } });
  assert.equal(result.bill_coverage_by_card[0].transactions_available, false);
  assert.equal(result.metrics.card_spending.confidence, 'low');
  assert.equal(result.bills.length, 2);
  assert.equal(JSON.stringify(result).includes('secret-body'), false);
});

test('invalid payment/charge/date metadata fails validation; conversion fields are preserved', async () => {
  for (const next of [february({ payments: [payment(-1)] }), february({ financeCharges: [charge(-1)] }), february({ dueDate: '2026-02-99' }), february({ payments: [payment(512.5, { paymentDate: 'not-a-date' })] })]) {
    const { result } = await snapshot({ bills: [january(), next] });
    assert.equal(result.bill_coverage_by_card[0].reason, 'validation_failed');
  }
  const { result } = await snapshot({ bills: [january(), february({ payments: [payment(512.5, { conversionMetadata: { originalCurrency: 'USD' } })] })], transactions: [transaction('converted', { amountInAccountCurrency: -512.5, operationType: 'PAGAMENTO_FATURA' })] });
  assert.deepEqual(result.bills[1].payments[0].conversionMetadata, { originalCurrency: 'USD' });
  assert.equal(result.transactions[0].amount_in_account_currency_centavos, -51250);
});

test('payment outside the reference cycle cannot confirm settlement', async () => {
  const { result } = await snapshot({ bills: [january(), february({ payments: [payment(512.5, { paymentDate: '2026-03-10T00:00:00Z' })] })] });
  assert.equal(result.cards[0].current_bill.remaining_amount_centavos, null);
  assert.equal(result.cards[0].current_bill.reconciliation.reason, 'payment_date_outside_cycle');
});

test('a repeated Bills page with an advancing page number is not accepted as complete', async () => {
  const { result } = await snapshot({ handle: path => {
    if (path.startsWith('/bills?')) return { page: path.includes('page=2') ? 2 : 1, totalPages: 2, results: [january()] };
  }});
  assert.equal(result.bill_coverage_by_card[0].reason, 'validation_failed');
  assert.equal(result.bills.length, 0);
});
