# Pluggy MCP Starter

A self-hosted, read-only [Model Context Protocol](https://modelcontextprotocol.io/) server for querying your Pluggy Open Finance accounts and transactions.

It is designed to be installed by each person with **their own Pluggy credentials and Item IDs**. This repository never collects, hosts, or receives those secrets.

## What it does

- Reads accounts and transactions from one or more Pluggy connections.
- Exposes two MCP tools: `pluggy_schema` and `pluggy_query`.
- Lets the agent run safe, read-only SQLite `SELECT` queries against the requested date range.
- Includes accounts with no transactions in the period.
- Refuses incomplete synchronizations, unsafe SQL, repeated cursors, and partial multi-bank totals.

It does **not** initiate payments, write data, modify Pluggy Items, store financial data, or expose a general SQL database.

## Choose your installation mode

| Where your AI client runs | Recommended mode | Infrastructure required |
| --- | --- | --- |
| Claude Desktop, Cursor, Codex, local agents | Local stdio via `npx` | None |
| A remote/cloud MCP client | Streamable HTTP via Docker | Your own HTTPS-capable host |

An MCP client running in the cloud cannot reach `localhost` on your computer. There is no secure way around that: use the local mode, or run the optional Docker service in infrastructure you control.

## 1. Prepare Pluggy

1. Create an application at [Pluggy Dashboard](https://dashboard.pluggy.ai/).
2. Connect each bank through Pluggy Connect or your preferred Pluggy flow.
3. Save every returned `itemId`. Pluggy intentionally does not offer an API to list old Items, so capture IDs through the Connect `onSuccess` event or a webhook. See [Pluggy Items](https://docs.pluggy.ai/docs/item).
4. Copy `.env.example` to `.env` and fill your own values. Never commit it.

```text
PLUGGY_CLIENT_ID=...
PLUGGY_CLIENT_SECRET=...
PLUGGY_ITEM_IDS=item-id-for-bank-a,item-id-for-bank-b
```

## 2. Install locally — no deploy

This is the simplest and most private path. Add the following server entry to your MCP client's configuration:

```json
{
  "mcpServers": {
    "pluggy": {
      "command": "npx",
      "args": ["-y", "github:caiomioto2/pluggy-mcp-starter"],
      "env": {
        "PLUGGY_CLIENT_ID": "your-client-id",
        "PLUGGY_CLIENT_SECRET": "your-client-secret",
        "PLUGGY_ITEM_IDS": "item-id-1,item-id-2"
      }
    }
  }
}
```

After the first npm release, the `args` value will become `@caiomioto/pluggy-mcp`.

## 3. Optional: run it in your own cloud

Use this only when the MCP client itself runs remotely and can reach an HTTPS endpoint you control.

```bash
cp .env.example .env
# Fill in .env, including a long random MCP_HTTP_TOKEN.
docker compose up -d --build
```

The server listens on `http://127.0.0.1:3000/mcp` and requires:

```http
Authorization: Bearer <MCP_HTTP_TOKEN>
```

Put a TLS reverse proxy in front of it before making it available to any remote MCP client. Do not expose port 3000 directly to the internet.

## Available tools

### `pluggy_schema`

Returns the SQLite tables, field meanings, safe-query limits, and financial caveats.

### `pluggy_query`

Collects the requested date range from every Item in `PLUGGY_ITEM_IDS`, then runs one read-only `SELECT` or `WITH` query.

```json
{
  "from": "2026-09-01",
  "to": "2026-09-30",
  "sql": "SELECT nome, identificador_mascarado, tipo_conta, transacoes_no_periodo FROM contas ORDER BY tipo_conta, nome"
}
```

Call `pluggy_schema` before asking the model to calculate totals. Card payments, transfers, reversals, and pending entries are not automatically reconciled, so a raw debit total is not necessarily a consolidated expense total.

## Development

```bash
npm install
npm test
```

Requires Node.js 24.10 or later.

## Security and privacy

Financial data is sensitive. Keep credentials and Item IDs in your MCP client environment, secret manager, or cloud environment variables. The process stores fetched data only in memory for up to 15 minutes and never writes it to disk.

If you enable HTTP mode, HTTPS and a strong bearer token are mandatory. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
