# Financeiro MCP

[Versão em português](README.md)

Ask your AI how much you spent, where you spent it, and which accounts are connected. This MCP reads accounts and transactions from your Pluggy application. It does not move money or change data.

## Choose the right option

| Need | Use |
| --- | --- |
| Generic tools maintained by Pluggy | The [official Pluggy MCP](https://github.com/pluggyai/pluggy-mcp). |
| Financial questions or a controlled refresh of one connection across several banks | This project. It combines multiple `itemId`s and provides query and controlled refresh tools. |
| Codex, Claude Code, Cursor, or Claude Desktop on your computer | Local `npx` installation. No server needed. |
| ChatGPT web or Claude.ai | An HTTPS HTTP server or the OpenAI Secure MCP Tunnel. |

## Connect every account first

Each bank or card connection creates an `itemId`. Save every ID:

```env
PLUGGY_ITEM_IDS=item-id-santander,item-id-nubank,item-id-itau
```

One ID means one Pluggy connection. The [Portuguese connection guide](docs/01-conectar-contas-meu-pluggy.md) explains the flow with Meu Pluggy.

## Local installation

```json
{
  "mcpServers": {
    "financeiro": {
      "command": "npx",
      "args": ["-y", "@caiomioto/financeiro-mcp"],
      "env": {
        "PLUGGY_CLIENT_ID": "your-client-id",
        "PLUGGY_CLIENT_SECRET": "your-client-secret",
        "PLUGGY_ITEM_IDS": "item-id-1,item-id-2"
      }
    }
  }
}
```

## Cloud clients

Run the HTTP server with Docker behind HTTPS, or use the OpenAI Secure MCP Tunnel. The [tunnel guide](docs/03-openai-secure-mcp-tunnel.md) is in Portuguese.

`npx` installs the published npm package. Use the GitHub repository only to contribute or self-host.

## Tools

- `financeiro_schema` returns the available tables and SQL examples.
- `financeiro_query` accepts read-only `SELECT` queries over `accounts` and `transactions`.
- `financeiro_cartoes` returns credit cards, bills, installments, and documented `PENDING`/`POSTED` semantics while preserving raw Pluggy data and never inferring missing fields.
- `financeiro_refresh_item` requests one sync for one authorized `item_id`. Use it only after a real, recent change such as a payment, transfer, or income. Do not call it in a loop, schedule, or batch: Pluggy reserves this update for user-triggered actions and uses auto-sync for routine synchronization. It sends an empty body to Pluggy, never sends credentials or MFA, and never refreshes every connection at once. With `wait_for_completion: true`, it polls at most three times at two-second intervals without issuing another refresh.
- `financeiro_refresh_status` reads the current sync state. When it returns `UPDATED`, call `financeiro_query` again: refresh invalidates the 15-minute in-memory snapshot, so the query collects fresh data.

For “how much will I have to pay in card bills next month?”, use `financeiro_cartoes.faturas_a_vencer_no_periodo.total_por_moeda`. It adds the `totalAmount` of Credit Card Bills whose due date falls within the requested period. Treat the returned amount as complete only when `coverage.complete` is `true`; `saldo_centavos` is current card usage, not a bill. `bill_coverage_by_card` distinguishes returned bills, an empty response, and an API failure. An empty list does not prove bill support or that no bill exists.

`financeiro_cartoes` keeps `metrics.card_spending`, `metrics.bills_due`, and `metrics.bill_payments` separate. `provider_status` preserves raw `PENDING`/`POSTED`; `financial_state` adds meaning only when evidence supports it. An installment number without a linked bill does not prove that it is a future installment and remains `installment_unassigned`. Transaction dates are not due dates by default. Without provider-supplied `bill_id`/`expected_bill_id`, cycle, or due date, those fields remain unavailable. `next_bill_estimate` is only a cautious subtotal of observed open purchases, excludes future and unassigned installments, and leaves `projected_total_by_currency` null when a total cannot be supported. Payment pairs based on amount, currency, and date are heuristic candidates (`candidate_card_pending`/`candidate_card_posted`), not proof of settlement; a card-side `PENDING` payment remains pending.

`current_bill.paid_amount_centavos` and `remaining_amount_centavos` stay null when collection cannot confirm settlement. Pluggy determines settlement by comparing payments and finance charges in the following bill against the prior bill total; a `POSTED` payment transaction alone does not prove the full balance was paid.

Every `accounts` row also keeps its Pluggy origin: `item_id`, `connector_id`, `connector_name`, and, when Pluggy returns it, `institution_name`. Accounts and cards from the same connection share an `item_id`. The project never infers an institution from transaction descriptions; when Pluggy does not provide it, the field is `NULL`.

Example sequence:

```text
financeiro_refresh_item({ item_id: "...", wait_for_completion: true })
financeiro_refresh_status({ item_id: "..." })
financeiro_query({ sql: "SELECT * FROM accounts", from: "2026-01-01", to: "2026-01-31" })
```

## Security

Never commit Pluggy credentials, Item IDs, tokens, or financial data. Put them in a local `.env`, deployment secrets, or a secret manager.

## License

[MIT](LICENSE).
