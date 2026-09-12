# Pluggy MCP Starter

[Read this in English](README.en.md)

Pergunte à sua IA quanto gastou, onde gastou e quais contas estão conectadas. Este MCP lê as contas e transações da sua aplicação Pluggy. Ele não move dinheiro nem altera dados.

Exemplos de perguntas que ele responde:

- "Quanto gastei com Uber neste mês?"
- "Mostre meus gastos por categoria nos últimos 90 dias."
- "Quais contas e cartões eu conectei?"

## Qual caminho faz sentido?

| Situação | Use |
| --- | --- |
| Você quer as ferramentas genéricas mantidas pela Pluggy | O [pluggy-mcp oficial](https://github.com/pluggyai/pluggy-mcp). |
| Você quer fazer perguntas financeiras sobre mais de um banco | Este projeto. Ele junta os dados de vários `itemId`s e expõe duas ferramentas de consulta. |
| Você usa Codex, Claude Code, Cursor ou Claude Desktop no seu computador | A instalação local com `npx`. Não exige servidor. |
| Você usa ChatGPT web ou Claude.ai | Um servidor HTTP com HTTPS, ou o Secure MCP Tunnel da OpenAI. |

Um cliente na nuvem não consegue abrir um processo no seu computador. Por isso, ChatGPT web e Claude.ai precisam de uma opção remota.

## Antes de instalar

Conecte cada banco e cartão que quer consultar. Cada conexão cria um `itemId`. Guarde todos eles:

```env
PLUGGY_ITEM_IDS=item-id-santander,item-id-nubank,item-id-itau
```

Se você informar um único ID, verá somente as contas daquele banco. Este foi o motivo de o projeto original mostrar apenas uma conexão.

O [guia do Meu Pluggy](docs/01-conectar-contas-meu-pluggy.md) mostra como criar e guardar as conexões. A API do Pluggy não lista os Items existentes. Você precisa registrar o ID quando concluir cada conexão. Veja também a documentação de [Items](https://docs.pluggy.ai/docs/item) e [Accounts](https://docs.pluggy.ai/reference/accounts-list).

## Instalação local

Adicione isto à configuração MCP do seu cliente:

```json
{
  "mcpServers": {
    "pluggy": {
      "command": "npx",
      "args": ["-y", "github:caiomioto2/pluggy-mcp-starter"],
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
  -- npx -y github:caiomioto2/pluggy-mcp-starter
```

Hoje o `npx` baixa o projeto do GitHub. Quando o pacote estiver publicado no npm, troque o argumento por `@caiomioto/pluggy-mcp`.

## Uso no ChatGPT web ou Claude.ai

### Servidor HTTP próprio

```bash
git clone https://github.com/caiomioto2/pluggy-mcp-starter.git
cd pluggy-mcp-starter
cp .env.example .env
docker compose up -d --build
```

Preencha o `.env` com suas credenciais Pluggy, todos os `itemId`s e um `MCP_HTTP_TOKEN` longo. O MCP atende em `http://SEU_SERVIDOR:3000/mcp`. Coloque um proxy HTTPS na frente dele antes de registrá-lo em um cliente na nuvem.

### Secure MCP Tunnel da OpenAI

O tunnel conecta um MCP privado a produtos OpenAI compatíveis sem abrir uma URL pública. O [guia de tunnel](docs/03-openai-secure-mcp-tunnel.md) inclui o `docker compose` e o registro no ChatGPT.

Ele não transforma o projeto em plugin público. Para distribuir um plugin, hospede o MCP em uma URL HTTPS estável. A [documentação da OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) explica a diferença.

## Ferramentas

`pluggy_schema` mostra as tabelas disponíveis e exemplos de SQL.

`pluggy_query` executa apenas consultas `SELECT` nas tabelas `accounts` e `transactions`.

```sql
SELECT merchant_name, description, amount, date, account_name
FROM transactions
WHERE date >= '2026-01-01'
ORDER BY date DESC
LIMIT 50
```

O servidor bloqueia comandos que escrevem ou alteram o banco de consulta.

## Segurança

Não coloque `clientSecret`, `itemId`, extrato ou token em commit, issue ou chat público. Use `.env` no computador, secrets do seu deploy ou um cofre de segredos. Este repositório tem somente valores de exemplo.

## Desenvolvimento

```bash
npm install
npm test
npm run build
```

## Licença

[MIT](LICENSE).
