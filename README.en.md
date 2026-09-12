# Pluggy MCP Starter

[Versão em português](README.md)

A read-only MCP server for querying Pluggy accounts and transactions from a financial agent.

## Which MCP should I use?

- Use the vendor-maintained, generic [official Pluggy MCP](https://github.com/pluggyai/pluggy-mcp) when that is all you need.
- Use this project when you want a focused financial-query interface: two tools, safe read-only SQL, and aggregation across multiple Pluggy Item IDs.

## Quick local setup

Connect every bank/card first and save each Pluggy `itemId`. Then configure your MCP client:

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

For cloud clients, deploy the HTTP server with Docker behind HTTPS, or use the OpenAI Secure MCP Tunnel. Portuguese guides cover [connecting accounts](docs/01-conectar-contas-meu-pluggy.md) and the [tunnel deployment](docs/03-openai-secure-mcp-tunnel.md).

## Tools

- `pluggy_schema`: returns the available tables and query examples.
- `pluggy_query`: runs a read-only `SELECT` query over `accounts` and `transactions`.

## Security

Never commit Pluggy credentials, Item IDs, or financial data. Use a local `.env`, deployment secrets, or a secret manager.

## License

[MIT](LICENSE).
