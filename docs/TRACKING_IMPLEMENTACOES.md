# Tracking de Implementacoes

## 2026-02-21

### Chat entre usuarios
- Chat direto entre usuarios, independente da loja logada.
- Rotas adicionadas:
  - `GET /api/chat/users`
  - `GET /api/chat/conversations`
  - `GET /api/chat/messages/:userId`
  - `POST /api/chat/messages`
  - `POST /api/chat/messages/:userId/read`
- Notificacao automatica no chat para solicitacao de transferencia.
- Ajuste de mensagem da transferencia:
  - Remove loja remetente da frase.
  - Inclui nome do usuario solicitante.
- Badge `Nova` no menu lateral para mensagens nao lidas.
- Presenca online/offline no chat (janela de atividade recente).

### Banco de dados (chat/presenca)
- `ChatMessage` para mensagens de chat entre usuarios.
- `User.lastSeenAt` para controle de presenca online.

### Vendas (base controlados)
- Estrutura base iniciada para dispensacao de medicamentos controlados:
  - `SaleControlledDispensation` vinculada a `Sale`.
  - Inclusao em `loadFullSale` para retorno completo da venda.
