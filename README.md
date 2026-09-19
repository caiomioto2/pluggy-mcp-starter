# Financeiro MCP — Pluggy Open Finance para Agentes de IA

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-green.svg)](https://modelcontextprotocol.io/)

Pergunte à sua IA quanto gastou, onde gastou e quais contas estão conectadas. Este servidor MCP exponde suas contas e transações do Pluggy Open Finance para agentes de IA — **read-only, sem mover dinheiro nem alterar dados**.

## Por que esse projeto existe

O [pluggy-mcp oficial](https://github.com/pluggyai/pluggy-mcp) é ótimo para demonstrações rápidas com um único `itemId`. Mas na vida real você tem Santander, Nubank, Itaú, Inter... cada um gera um `itemId` diferente, e seu agente precisa consultar todos de uma vez.

Este projeto:
- **Agrega múltiplos `itemId`s** em um único banco de dados local
- **Expor ferramentas em português** (`financeiro_query`, `financeiro_schema`, `financeiro_refresh_item`)
- **Read-only por padrão** — o agente consulta, nunca movimenta
- **Self-hosted** — seus dados financeiros não saem do seu servidor

## Qual caminho faz sentido?

| Situação | Use |
| --- | --- |
| Demonstração rápida com um banco só | [pluggy-mcp oficial](https://github.com/pluggyai/pluggy-mcp) |
| Consultar múltiplos bancos em agentes de IA | **Este projeto** |
| Codex, Claude Code, Cursor, Claude Desktop | Instalação local com `npx` (não exige servidor) |
| ChatGPT web ou Claude.ai | Servidor HTTP com HTTPS + Secure MCP Tunnel |

## Exemplos de perguntas que ele responde

- "Quanto gastei com Uber neste mês?"
- "Mostre meus gastos por categoria nos últimos 90 dias."
- "Quais contas e cartões eu conectei?"
- "Qual meu saldo consolidado?"
- "Liste as últimas 50 transações do Nubank"

## Antes de instalar

Conecte cada banco e cartão no [Meu Pluggy](https://meu.pluggy.ai/). Cada conexão gera um `itemId`:

```env
PLUGGY_ITEM_IDS=item-id-santander,item-id-nubank,item-id-itau
```

> ⚠️ A API do Pluggy **não lista** `itemId`s existentes. Anote cada um quando conectar!

Guia passo a passo: [docs/01-conectar-contas-meu-pluggy.md](docs/01-conectar-contas-meu-pluggy.md)

## Instalação local

Adicione ao seu cliente MCP:

```json
{
  "mcpServers": {
    "financeiro": {
      "command": "npx",
      "args": ["-y", "@caiomioto/financeiro-mcp"],
      "env": {
        "PLUGGY_CLIENT_ID": "seu-client-id",
        "PLUGGY_CLIENT_SECRET": "seu-client-secret",
        "PLUGGY_ITEM_IDS": "item-id-1,item-id-2"
      }
    }
  }
}
```

No Claude Code:

```bash
claude mcp add pluggy \
  --env PLUGGY_CLIENT_ID=seu-client-id \
  --env PLUGGY_CLIENT_SECRET=seu-client-secret \
  --env PLUGGY_ITEM_IDS=item-id-1,item-id-2 \
  -- npx -y @caiomioto/financeiro-mcp
```

## Servidor HTTP (ChatGPT / Claude.ai)

```bash
git clone https://github.com/caiomioto2/pluggy-mcp-starter.git
cd pluggy-mcp-starter
cp .env.example .env
docker compose up -d --build
```

O MCP atende em `http://SEU_SERVIDOR:3000/mcp`. Coloque um proxy HTTPS na frente.

Para OpenAI Secure MCP Tunnel, veja: [docs/03-openai-secure-mcp-tunnel.md](docs/03-openai-secure-mcp-tunnel.md)

## Ferramentas disponíveis

| Ferramenta | O que faz |
| --- | --- |
| `financeiro_schema` | Lista tabelas (`accounts`, `transactions`) e exemplos de SQL |
| `financeiro_query` | Executa `SELECT` nas tabelas financeiras (read-only) |
| `financeiro_refresh_item` | Solicita sincronização de uma conexão específica |
| `financeiro_refresh_status` | Mostra estado da sincronização |

### Exemplo de consultas

```sql
-- Últimas 50 transações de todas as contas
SELECT merchant_name, description, amount, date, account_name
FROM transactions
ORDER BY date DESC
LIMIT 50

-- Gastos por categoria nos últimos 90 days
SELECT category, SUM(amount) as total
FROM transactions
WHERE date >= '2026-01-01'
GROUP BY category
ORDER BY total DESC

-- Saldo consolidado por conta
SELECT account_name, currency_code, current_balance
FROM accounts
WHERE type = 'BANK'
```

## Segurança

- **Nunca** coloque `clientSecret` ou `itemId` em commit, issue ou chat
- Use `.env` local ou secrets do seu deploy
- Servidor bloqueia qualquer comando que escreva ou altere dados
- Read-only por padrão — o agente consulta, nunca movimenta

## Desenvolvimento

```bash
npm install
npm test
npm run build
```

## Licença

[MIT](LICENSE)
