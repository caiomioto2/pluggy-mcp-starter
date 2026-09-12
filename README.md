# Pluggy MCP Starter

[English version](README.en.md)

Um MCP — protocolo que permite a uma IA usar ferramentas externas — para consultar, de forma somente leitura, contas e transações do Pluggy. Ele foi pensado para um agente financeiro responder perguntas como: "quanto gastei com Uber este mês?" ou "quais contas tenho conectadas?".

## Comece por aqui

| Se você quer... | Melhor caminho |
| --- | --- |
| Um MCP genérico mantido pela própria Pluggy | Use o [pluggy-mcp oficial](https://github.com/pluggyai/pluggy-mcp). |
| Um agente financeiro com consulta SQL segura e várias conexões bancárias | Use este projeto. |
| Usar no Codex, Claude Code, Cursor ou Claude Desktop sem servidor | Instale localmente via `npx`. |
| Usar no ChatGPT web ou Claude.ai | Faça deploy HTTP com Docker ou use o Secure MCP Tunnel da OpenAI. |

Clientes na nuvem não alcançam o seu computador local. Para eles, escolha uma das opções remotas acima.

## O que este MCP entrega

- Busca contas e transações de todos os `itemId`s configurados.
- Expõe apenas duas ferramentas: `pluggy_schema` e `pluggy_query`.
- Aceita somente consultas SQL `SELECT`, sem alterar dados.
- Inclui contas sem transações e bloqueia resultados potencialmente incompletos.

## 1. Conecte seus bancos

Crie uma conexão para cada banco ou cartão e guarde o respectivo `itemId`. O [guia detalhado do Meu Pluggy](docs/01-conectar-contas-meu-pluggy.md) mostra o fluxo para fazer isso pela interface de referência oficial.

Depois, reúna todos os IDs em uma variável:

```env
PLUGGY_ITEM_IDS=item-id-santander,item-id-nubank,item-id-itau
```

O Pluggy não oferece uma rota para listar itens existentes por motivos de segurança; você precisa registrar os IDs ao criar cada conexão. A rota de contas recebe um `itemId` específico. Veja a documentação oficial de [Items](https://docs.pluggy.ai/docs/item) e [Accounts](https://docs.pluggy.ai/reference/accounts-list).

## 2. Instale localmente, sem deploy

Crie ou edite a configuração MCP do seu cliente e use:

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

No Claude Code, por exemplo:

```bash
claude mcp add pluggy \
  --env PLUGGY_CLIENT_ID=seu-client-id \
  --env PLUGGY_CLIENT_SECRET=seu-client-secret \
  --env PLUGGY_ITEM_IDS=item-id-1,item-id-2 \
  -- npx -y github:caiomioto2/pluggy-mcp-starter
```

Quando o pacote for publicado no npm, você poderá substituir o argumento pelo nome do pacote `@caiomioto/pluggy-mcp`.

## 3. Use na nuvem

### Opção A: endpoint HTTP próprio

```bash
git clone https://github.com/caiomioto2/pluggy-mcp-starter.git
cd pluggy-mcp-starter
cp .env.example .env
docker compose up -d --build
```

Preencha o `.env` com suas credenciais, seus `itemId`s e um `MCP_HTTP_TOKEN` longo e aleatório. O endpoint será `http://SEU_SERVIDOR:3000/mcp`; coloque HTTPS na frente dele antes de conectá-lo a um cliente em nuvem.

### Opção B: Secure MCP Tunnel da OpenAI

O tunnel mantém o servidor privado e abre uma conexão HTTPS de saída para produtos OpenAI compatíveis. O [guia de tunnel](docs/03-openai-secure-mcp-tunnel.md) traz um `docker compose` pronto e o passo a passo de registro no ChatGPT.

O Secure MCP Tunnel não serve para distribuir um plugin público: para isso, publique um endpoint HTTPS estável. Consulte a [documentação oficial da OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## Ferramentas disponíveis

`pluggy_schema` retorna o modelo de dados e exemplos de consulta.

`pluggy_query` recebe uma consulta como esta:

```sql
SELECT merchant_name, description, amount, date, account_name
FROM transactions
WHERE date >= '2026-01-01'
ORDER BY date DESC
LIMIT 50
```

Tabelas: `accounts` e `transactions`.

## Segurança

Não envie credenciais do Pluggy, `itemId`s ou extratos para commits, issues, chat público ou arquivos versionados. Use `.env` local, secrets do provedor de deploy ou um cofre de segredos. Este repositório inclui somente exemplos sem dados reais.

## Desenvolvimento

```bash
npm install
npm test
npm run build
```

## Licença

[MIT](LICENSE).
