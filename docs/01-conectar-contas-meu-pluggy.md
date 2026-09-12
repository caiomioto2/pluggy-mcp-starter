# Conecte suas contas com Meu Pluggy

Esta página usa o fluxo do projeto oficial [Meu Pluggy](https://github.com/pluggyai/meu-pluggy). Ele separa duas coisas que costumam confundir no começo:

- O Meu Pluggy guarda seu consentimento e a conexão com o banco.
- A sua aplicação Pluggy ganha permissão para ler aquela conexão e usá-la neste MCP.

Você precisa fazer as duas partes para cada banco que quer consultar.

## Parte 1. Conecte o banco no Meu Pluggy

1. Crie sua conta em [meu.pluggy.ai](https://meu.pluggy.ai).
2. Clique no botão principal para adicionar uma conta.
3. Pesquise a instituição financeira.
4. Siga a autorização do banco. Alguns bancos pedem confirmação no aplicativo ou uma etapa extra de segurança.
5. Ao terminar, confira se a conta, cartão e transações aparecem no Meu Pluggy.

Repita para cada banco. Não basta conectar uma conta Santander para que Nubank, Itaú ou outro banco apareçam aqui.

## Parte 2. Dê acesso à sua aplicação Pluggy

1. Entre no [Dashboard Pluggy](https://dashboard.pluggy.ai/) e crie sua conta de desenvolvedor.
2. Na configuração da aplicação, inclua o conector Meu Pluggy na lista de conectores permitidos.
3. Crie uma Development Application. Ela fornece o `client_id` e o `client_secret` usados pelo MCP.
4. Abra a aplicação de demonstração no Dashboard.
5. Autorize a ligação entre sua conta Meu Pluggy e sua aplicação de desenvolvedor.
6. Repita essa autorização para cada banco conectado no Meu Pluggy.

Depois disso, a conexão fica disponível na sua aplicação Pluggy. Guarde o `itemId` que representa cada banco.

```env
PLUGGY_ITEM_IDS=item-id-santander,item-id-nubank,item-id-itau
```

## Por que preciso guardar o `itemId`?

O `itemId` é o identificador de uma conexão com uma instituição financeira. O endpoint de contas recebe um Item por vez. Quando você coloca todos os IDs em `PLUGGY_ITEM_IDS`, este MCP busca cada conexão e junta os resultados.

Se houver somente um ID, o agente verá somente aquele banco. Se um banco ficou de fora, volte à Parte 2 e confirme que ele também foi autorizado para sua aplicação.

A Pluggy não oferece uma rota para listar conexões existentes. Isso é uma escolha de segurança. Registre cada `itemId` quando concluir a autorização. A explicação oficial está em [Items](https://docs.pluggy.ai/docs/item).

## Quando uma conexão não atualiza

Uma conexão pode exigir nova autorização depois de uma alteração de senha, uma expiração de consentimento ou uma etapa de confirmação do banco. Abra o Meu Pluggy e reconecte a instituição. Só consulte os dados depois que a sincronização terminar.

A Pluggy usa o Connect Widget para criar e atualizar Items. Quando a sincronização dá certo, o Item fica pronto para consulta. A documentação de [Items](https://docs.pluggy.ai/docs/item) descreve os estados e a atualização automática.

## Não exponha estes dados

- Seu `client_secret`.
- Seus `itemId`s.
- Tokens de API.
- Senhas, códigos de confirmação ou extratos.

Coloque credenciais e IDs em `.env` local, secrets do deploy ou um cofre de segredos. Não os envie para commits, issues ou chats públicos.

## Referências

- [Meu Pluggy no GitHub](https://github.com/pluggyai/meu-pluggy)
- [Meu Pluggy](https://meu.pluggy.ai)
- [Dashboard Pluggy](https://dashboard.pluggy.ai/)
- [Documentação de Items](https://docs.pluggy.ai/docs/item)
