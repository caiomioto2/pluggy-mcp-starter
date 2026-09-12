# Secure MCP Tunnel da OpenAI

Use este caminho quando quiser registrar o MCP em um produto OpenAI sem expor um endpoint público. O tunnel executa seu servidor em Docker e cria uma conexão HTTPS de saída autenticada.

## Você precisa de

- Docker no servidor que vai executar o MCP.
- Credenciais Pluggy e os Item IDs de todas as conexões.
- Acesso ao Secure MCP Tunnel, um `tunnel_id` e uma chave de runtime da OpenAI.

## Configuração

Na raiz do projeto, crie o arquivo de ambiente:

```bash
cp .env.example .env
```

Além das variáveis do Pluggy, preencha:

```env
OPENAI_TUNNEL_ID=tunnel_substitua-pelo-seu
CONTROL_PLANE_API_KEY=sk-substitua-pela-sua-chave
```

Suba o container:

```bash
docker compose -f deployment/openai-tunnel/compose.yaml up -d --build
```

O cliente de tunnel oferece `/healthz`, `/readyz`, métricas e uma UI local na porta `8080`. A porta fica ligada apenas a `127.0.0.1` neste exemplo.

No ChatGPT, crie um Developer App, selecione a opção de tunnel e escolha o seu `tunnel_id`. Siga as etapas de associação e permissões do seu workspace descritas pela OpenAI.

## Limites importantes

O Secure MCP Tunnel é para uso privado em produtos OpenAI compatíveis. Ele não publica um plugin público nem gera uma URL pública reutilizável. Para distribuição pública, hospede o servidor HTTP em uma URL HTTPS estável e aplique autenticação.

Nunca versione o `.env` ou cole a chave de runtime em documentação, issue ou chat público.

Referências: [Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) e [tunnel-client](https://github.com/openai/tunnel-client).
