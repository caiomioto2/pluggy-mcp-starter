# Financeiro MCP — Pluggy Open Finance para Agentes de IA

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-green.svg)](https://modelcontextprotocol.io/)

Pergunte à sua IA quanto gastou, onde gastou e quais contas estão conectadas. Este servidor MCP exponde suas contas e transações do Pluggy Open Finance para agentes de IA — **read-only, sem mover dinheiro nem alterar dados**.

## Por que esse projeto existe

O [pluggy-mcp oficial](https://github.com/pluggyai/pluggy-mcp) é ótimo para demonstrações rápidas com um único `itemId`. Mas na vida real você tem Santander, Nubank, Itaú, Inter... cada um gera um `itemId` diferente, e seu agente precisa consultar todos de uma vez.

Este projeto:
- **Agrega múltiplos `itemId`s** em um único banco de dados local
- **Expor ferramentas em português** (`financeiro_query`, `financeiro_cartoes`, `financeiro_schema`, `financeiro_refresh_item`)
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
| `financeiro_cartoes` | Lista cartões, faturas, parcelas e a semântica documentada de `PENDING`/`POSTED`, sem inferir campos ausentes |
| `financeiro_refresh_item` | Solicita uma única sincronização de uma conexão específica, após mudança real e recente |
| `financeiro_refresh_status` | Mostra estado da sincronização |

> **Uso responsável do refresh:** use `financeiro_refresh_item` apenas após uma alteração real e recente. Não o use em loop, agendamento ou lote. A Pluggy reserva `PATCH /items/{id}` para atualizações disparadas pelo usuário; a sincronização de rotina é feita pelo auto-sync.

Para responder “quanto tenho de faturas para pagar no próximo mês?”, use `faturas_a_vencer_no_periodo.total_por_moeda` de `financeiro_cartoes`. Ele soma `totalAmount` das Credit Card Bills cujo vencimento cai no período solicitado. Só trate o resultado como total real quando `coverage.complete` for `true`; `saldo_centavos` é uso atual do cartão, não fatura. A cobertura conta cartões com Bill no período, e só fica completa quando cada cartão tem fatura retornada nesse período. `bill_coverage_by_card` separa fatura encontrada, bills fora do período, nenhuma fatura retornada e falha de API. Uma lista vazia ou faturas somente fora do período não prova que não há fatura no mês.

`financeiro_cartoes` separa `metrics.card_spending`, `metrics.bills_due` e `metrics.bill_payments`. `provider_status` preserva `PENDING`/`POSTED`; `financial_state` esclarece quando a evidência permite distinguir compra aberta, parcela ligada a uma fatura e parcela sem ciclo conhecido (`installment_unassigned`). Número de parcela sem vínculo de fatura não basta para chamá-la de futura. Datas de transação não são datas de vencimento por padrão; sem `bill_id`/`expected_bill_id`, ciclo ou vencimento fornecido, esses campos ficam vazios. `next_bill_estimate` contém apenas um subtotal cauteloso de compras abertas observadas, exclui parcelas futuras e sem ciclo conhecido e mantém `projected_total_by_currency` nulo quando não há evidência para projetar o total. Pares de pagamento por valor, moeda e data aparecem como candidatos (`candidate_card_pending`/`candidate_card_posted`), não confirmam quitação; `PENDING` no cartão continua pendente.

`current_bill.paid_amount_centavos` e `remaining_amount_centavos` permanecem nulos quando a coleta não consegue confirmar quitação. A Pluggy determina a liquidação comparando os pagamentos e encargos da fatura seguinte com o total da fatura anterior; um lançamento de pagamento `POSTED` sozinho não prova que o saldo inteiro foi pago.

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
