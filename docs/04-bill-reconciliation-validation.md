# Validação — saldo restante de faturas (2026-10-05)

Repositório corrigido: `caiomioto2/pluggy-mcp-starter`.
Base inspecionada: `0b3351ede799b3732ba19837905da0e291fb5260`.
O blob original de `src/cards.ts` é `1c8ef9b157a1594e554368304498f9b52d8aa051`, igual ao handoff `default:notes/handoff-pluggy-saldo-restante-faturas-2026-10-05`.

## Causa comprovada e limites

O exemplo oficial de Bill não inclui `accountId`. O schema anterior exigia esse campo e `collectCards` capturava o erro Zod como `request_failed`. Uma fixture sem `accountId` reproduziu `bills=0`, `reason=request_failed`, `current_bill=null`. Com o patch, o exemplo oficial completo é aceito e vinculado à conta da requisição. Um vínculo contraditório continua sendo rejeitado, com `validation_failed` e path sanitizado.

Também foi comprovado no código que pagamentos/saldo restante eram sempre nulos, que encargos e operationType eram descartados e que a listagem de Bills lia só a primeira página. A nova suíte valida esses comportamentos e o exemplo de quitação `500 + 12,50 = 512,50`.

Isso comprova defeitos do repositório, mas **não comprova a causa específica das falhas em produção**: o MCP antigo não expõe HTTP status nem erros de schema. Uma consulta somente leitura do plugin Finanças Pluggy, para 2026-10-01 até 2026-10-31, confirmou 5 conexões, 6 cartões, 0 Bills, 5 `request_failed` e 1 `empty_response`, ainda sem `remaining_balance`. Não foram copiados dados financeiros pessoais para este repositório.

Os MCPs `DockerListContainers` e `CoolifyListApplications` retornaram erro interno. O ambiente de desenvolvimento não possui bindings Pluggy nem identidade de infraestrutura configurados. Portanto não foi possível identificar serviço/commit implantado, conectores reais ou executar GET `/bills` no cliente autenticado do serviço. Existe um segundo repositório privado, `caiomioto2/pluggy-finance-mcp`, cujo package é versão 0.1.0; o starter é 0.2.0. Nenhuma paridade com produção foi presumida. Não existe AGENTS.md no checkout inspecionado.

## Contratos e compatibilidade

Fontes oficiais consultadas em 2026-10-05:

- [Bills: contrato e quitação pelo ciclo seguinte](https://v2.docs.pluggy.ai/en/docs/products/credit-card-bills)
- [Bills: paginação page/totalPages e exemplo sem accountId](https://docs.pluggy.ai/en/reference/bill/bills-list)
- [Transações: filtro público billId](https://docs.pluggy.ai/en/reference/transaction/transactions-list)
- [Transações v2: paginação por cursor](https://docs.pluggy.ai/en/reference/transaction/transactions-list-by-cursor)
- [Parcelas: distinção entre fluxo institucional e transações por billId](https://v2.docs.pluggy.ai/en/docs/products/credit-card-installments)

Não é usado SDK Pluggy; o cliente usa fetch REST. Dependências travadas verificadas: MCP SDK 1.30.0, Zod 4.6.2 e TypeScript 7.0.2; testes executados em Node 24.19.0.

A coleta detalhada por Bill usa `/transactions?accountId=...&billId=...&page=...`, sem filtro de data que pudesse excluir parcelas antigas. Esse endpoint documentado é depreciado até 2026-12-31. A referência pública v2 consultada não documenta billId: migrar essa parte quando o contrato substituto estiver confirmado. As transações recentes continuam no endpoint v2.

Mudanças de resposta: `payments` ausente/nulo permanece null em vez de virar lista vazia; novas razões de cobertura distinguem validação/HTTP/autorização/rate limit; status de fatura pode ser settled/partial/unpaid/unknown. Os novos campos de uso total, evidência e agregado são aditivos. Consumidores que assumiam apenas `unknown` ou sempre uma lista em `payments` precisam aceitar essas mudanças.

## Validação e reversão

`npm test` compila o projeto e executa a suíte completa, incluindo regressões de schema, paginação, ciclos, moedas, deduplicação, cobertura, metadados e proteção de diagnósticos. `git diff --check` verifica o patch.

O saldo calculado é uma fotografia dos ciclos retornados, não dívida em tempo real. Requer N+1 consecutiva já vencida, listas explícitas de pagamentos/encargos e atribuição consistente; evidência ausente ou ambígua mantém null com motivo. A data da consulta não comprova atualização bancária. Pagamentos bancários e transações do cartão nunca são descontados novamente.

O usuário autorizou deploy seguido de testes após a implementação. A execução depende de identificar e acessar o serviço implantado, repo/commit e configuração dos conectores; o acesso ainda não foi confirmado. Usar o cliente autenticado existente para GET `/bills` sem refresh, registrando somente status HTTP, endpoint sem IDs, forma/campos da resposta e paths/códigos Zod. Confirmar o novo contrato contra o payload real e comparar com a consulta do usuário. Após eventual deploy autorizado, reiniciar o serviço para eliminar cache antigo (TTL 15 minutos), repetir a mesma consulta e verificar cobertura e evidências; sucesso da ferramenta sozinho não valida o saldo.

Reversão: reverter o commit deste PR ou restaurar a imagem anterior identificada antes do deploy; reiniciar o serviço para descartar snapshots em memória. O patch não cria migrações de banco, refresh bancário ou alterações nos dados da instituição.
