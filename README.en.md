# Pluggy MCP Starter

[Versão em português](README.md)

Ask your AI how much you spent, where you spent it, and which accounts are connected. This MCP reads accounts and transactions from your Pluggy application. It does not move money or change data.

## Choose the right option

| Need | Use |
| --- | --- |
| Generic tools maintained by Pluggy | The [official Pluggy MCP](https://github.com/pluggyai/pluggy-mcp). |
| Financial questions across several banks | This project. It combines multiple `itemId`s and provides two query tools. |
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

## Tools

- `pluggy_schema` returns the available tables and SQL examples.
- `pluggy_query` accepts read-only `SELECT` queries over `accounts` and `transactions`.

Every `accounts` row also keeps its Pluggy origin: `item_id`, `connector_id`, `connector_name`, and, when Pluggy returns it, `institution_name`. Accounts and cards from the same connection share an `item_id`. The project never infers an institution from transaction descriptions; when Pluggy does not provide it, the field is `NULL`.

## Security

Never commit Pluggy credentials, Item IDs, tokens, or financial data. Put them in a local `.env`, deployment secrets, or a secret manager.

## License

[MIT](LICENSE).
