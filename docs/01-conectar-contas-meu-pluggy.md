# Conectando todas as contas com Meu Pluggy

O [Meu Pluggy](https://github.com/pluggyai/meu-pluggy) é o projeto de referência da Pluggy para criar conexões bancárias usando o Connect Widget. Cada conexão concluída cria um **Item** — o registro que representa a autorização de uma instituição — e possui um `itemId`.

## Passo a passo

1. Abra sua aplicação no [Dashboard Pluggy](https://dashboard.pluggy.ai/).
2. Execute ou publique uma cópia do Meu Pluggy com as credenciais da sua própria aplicação.
3. Escolha uma instituição e conclua a conexão no Connect Widget.
4. Copie o `itemId` retornado ao final da conexão ou exibido no Dashboard.
5. Repita o processo para cada banco, conta e cartão que deseja consultar.
6. Guarde os IDs juntos, separados por vírgulas:

```env
PLUGGY_ITEM_IDS=item-id-santander,item-id-nubank,item-id-itau
```

## Por que aparece só um banco?

O endpoint de contas do Pluggy busca dados de um `itemId` por vez. Se a configuração tiver apenas um ID, o agente verá apenas as contas ligadas àquela conexão. Adicionar todos os IDs em `PLUGGY_ITEM_IDS` faz este MCP consultar e unir os resultados.

Por segurança, a API não permite listar livremente todos os Items já criados. Registre cada `itemId` ao criar a conexão. Consulte a documentação oficial de [Items](https://docs.pluggy.ai/docs/item) e [Accounts](https://docs.pluggy.ai/reference/accounts-list).

## Segurança

Não cole senha bancária, `clientSecret`, `itemId` ou dados de extrato em repositórios, issues ou chats públicos. Mantenha esses valores em `.env` local, secrets do provedor ou um cofre de segredos.
