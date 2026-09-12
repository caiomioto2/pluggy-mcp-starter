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

## Cloud clients

Run the HTTP server with Docker behind HTTPS, or use the OpenAI Secure MCP Tunnel. The [tunnel guide](docs/03-openai-secure-mcp-tunnel.md) is in Portuguese.

After the package is published, replace the GitHub argument with `@caiomioto/financeiro-mcp` for a simpler installation.

## Tools

- `financeiro_schema` returns the available tables and SQL examples.
- `financeiro_query` accepts read-only `SELECT` queries over `accounts` and `transactions`.
- `financeiro_refresh_item` requests a sync for one authorized `item_id`. Use it after a payment, transfer, income, or other recent change. It sends an empty body to Pluggy, never sends credentials or MFA, and never refreshes every connection at once. With `wait_for_completion: true`, it polls at most three times at two-second intervals.
- `financeiro_refresh_status` reads the current sync state. When it returns `UPDATED`, call `financeiro_query` again: refresh invalidates the 15-minute in-memory snapshot, so the query collects fresh data.

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
