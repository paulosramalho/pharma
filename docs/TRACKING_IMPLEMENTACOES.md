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

## 2026-02-22

### Licenciamento - Backlog tecnico (Pacote Minimo)

#### Escopo funcional do pacote minimo
- Usuarios: limite de 4 usuarios ativos por tenant:
  - 1 `ADMIN`
  - 1 `VENDEDOR`
  - 1 `CAIXA`
  - 1 `FARMACEUTICO`
- Lojas: limite de 1 loja ativa por tenant.
- Dashboard: visao simplificada (KPIs basicos).
- Modulos permitidos:
  - `Vendas`: habilitado
  - `Caixa`: habilitado
  - `Estoque`: habilitado sem transferencias e sem reservas
  - `Produtos`: habilitado
  - `Configuracoes`: habilitado no que couber ao pacote
  - `Relatorios`: apenas Vendas e Fechamento de Caixa
- Modulos bloqueados:
  - `Chat`: bloqueado
  - `Transferencias`: bloqueado
  - `Reservas`: bloqueado

#### EPIC LIC-01 - Fundacao de licenciamento
- [BE] Criar entidades:
  - `LicensePlan` (slug, nome, limites, flags)
  - `TenantLicense` (tenantId, planId, status, startsAt, endsAt, graceUntil)
  - `TenantFeatureOverride` (opcional, para ajuste manual)
- [BE] Seed inicial do plano `MINIMO`.
- [BE] Endpoint `GET /api/license/me` para frontend consumir plano atual.
- [BE] Middleware `requireLicenseFeature(featureKey)` e `requireLicenseLimit(limitKey)`.
- [BE] Cache curto em memoria para reduzir custo de validacao por request.
- [QA] Testes de unidade para parser de limites e status da licenca.

#### EPIC LIC-02 - Aplicacao de limites de usuarios e lojas
- [BE] Regra de criacao/ativacao de usuario:
  - Bloquear acima de 4 ativos.
  - Bloquear perfis duplicados no pacote minimo quando ja existir 1 no perfil limitado.
- [BE] Regra de criacao/ativacao de loja:
  - Bloquear acima de 1 loja ativa.
- [BE] Mensagens padrao de bloqueio:
  - "Limite do plano MINIMO atingido para usuarios."
  - "Limite do plano MINIMO atingido para lojas."
- [FE] Exibir erro amigavel em toast/modal quando backend bloquear operacao.
- [QA] Cenarios:
  - 5o usuario ativo deve falhar.
  - 2a loja ativa deve falhar.

#### EPIC LIC-03 - Controle de modulos e menus
- [FE] Feature flags de menu por plano:
  - Ocultar `Chat`.
  - Ocultar entradas de `Transferencias` e `Reservas`.
- [BE] Hard block de rotas de chat/transferencia/reserva quando plano nao permitir.
- [FE] Dashboard simplificado:
  - Manter cards basicos de vendas, caixa e estoque.
  - Ocultar visoes avancadas do dashboard.
- [QA] Garantir que esconder no frontend nao substitui bloqueio no backend.

#### EPIC LIC-04 - Relatorios permitidos
- [BE] Liberar somente:
  - Relatorio de Vendas
  - Relatorio de Fechamento de Caixa
- [BE] Bloquear demais relatorios por licenca.
- [FE] Mostrar somente relatorios permitidos no seletor/lista.
- [QA] Validar exportacao PDF dos dois relatorios liberados.

#### EPIC LIC-05 - Configuracoes no pacote minimo
- [FE] Em `Configuracoes`, esconder secoes nao aplicaveis ao pacote.
- [BE] Validar permissao/licenca em endpoints sensiveis de configuracao.
- [QA] Garantir que `ADMIN` do tenant consegue operar apenas o escopo permitido.

#### Criterios de aceite globais (DoD)
- Nao e possivel ultrapassar limites de usuarios/lojas do plano minimo.
- Modulos bloqueados nao aparecem no menu e retornam 403/402 padronizado no backend.
- Dashboard aparece em modo simplificado para plano minimo.
- Relatorios disponiveis apenas: Vendas e Fechamento de Caixa.
- Todas as mensagens de bloqueio estao padronizadas e compreensiveis.
- Testes minimos de regressao executados (backend + frontend build).

### Licenciamento - Implementacao inicial (fase 1)
- Implementado servico de licenciamento em:
  - `backend/src/common/licensing/license.service.js`
- Endpoint novo:
  - `GET /api/license/me`
- Aplicacao de licenca no backend:
  - Bloqueio de `chat`
  - Bloqueio de `inventoryTransfers`
  - Bloqueio de `inventoryReservations`
  - Bloqueio de `reportsTransfers`
  - Dashboard com modo `SIMPLIFIED` no pacote minimo
  - Limite de usuarios ativos e limite por perfil no cadastro/ativacao de usuario
  - Limite de lojas ativas no cadastro/ativacao de loja
- Aplicacao de licenca no frontend:
  - `AuthContext` passa a carregar licenca e expor `hasFeature`
  - Sidebar esconde modulos bloqueados por plano
  - Aba de transferencias/reservas removida do Estoque no pacote minimo
  - Aba de transferencias removida de Relatorios no pacote minimo
  - Rota `/chat` redireciona para `/dashboard` quando chat estiver bloqueado
  - Dashboard simplificado respeitando `dashboardMode`

### Precificacao dos planos (benchmark de mercado em 2026-02-22)
- Plano `MINIMO`:
  - `R$ 149,00 / mes`
  - `R$ 1.430,00 / ano`
- Plano `PROFISSIONAL`:
  - `R$ 299,00 / mes`
  - `R$ 2.870,00 / ano`
- Plano `ENTERPRISE`:
  - `R$ 899,00 / mes`
  - `R$ 8.630,00 / ano`

### Referencias de benchmark usadas (publicas)
- Bling (faixa de planos de entrada a avancados): `R$ 55` ate `R$ 650`.
- Omie Store (aplicativos integrados com faixas medias): `R$ 109,90` ate `R$ 990`.
- Grupo Hiper Saude (farmacia, pacote de gestao): `R$ 399` a `R$ 1.699`.
- Nuvem Farma Doc (farmacia, ticket de entrada): `R$ 97` a `R$ 267`.

### Endurecimento multi-tenant (backend + banco)
- Isolamento por tenant reforcado nas rotas criticas:
  - `sales` (CRUD de venda, itens, confirmacao, pagamento, cancelamento, troca e liquidacao)
  - `customers` (consulta por id com escopo de tenant)
  - `inventory/transfers` e `inventory/reservations` (aprovacao, envio, recebimento, cancelamento)
  - `inventory/lots` e `inventory/valuation` (escopo via loja do tenant)
  - `pos/transactions` (bloqueio por tenant + loja)
  - `reports/transferencias` (filtro e lookup auxiliares por tenant)
- JWT e auth guard propagando `tenantId` em `req.user` e no token de refresh.
- Licenca por tenant:
  - `TenantLicense` para estado/plano atual
  - `TenantLicenseAudit` para trilha de alteracoes (quem mudou, de/para, motivo e payload)
  - Endpoint `PUT /api/license/me` grava auditoria por tenant.
- Indices compostos com `tenantId` adicionados para performance:
  - `User(tenantId, email)`
  - `Category(tenantId, name)`
  - `Sale(tenantId, number)`
  - `Customer(tenantId, document)`
  - `StockTransfer(tenantId, createdById, createdAt)`
  - `StockReservation(tenantId, requestedById, createdAt)`
- Migracao tecnica ponta a ponta documentada em:
  - `docs/MIGRACAO_TENANT_PONTA_A_PONTA.md`
- Auditoria automatica de consistencia cross-tenant criada:
  - script: `backend/scripts/tenant-audit.js`
  - comando: `npm.cmd run tenant:audit` (em `backend`)
  - status atual: script validado localmente; sem conectividade de rede com Neon no ambiente atual para concluir a leitura.

### Tenant - Fase 3 (tabelas filhas)
- Migration adicionada:
  - `backend/prisma/migrations/20260222183000_tenant_children_enforcement/migration.sql`
- Tabelas filhas com `tenantId` + FK + indice:
  - `InventoryLot`
  - `InventoryMovement`
  - `SaleItem`
  - `Payment`
  - `PosTransaction`
  - `Discount`
  - `Address`
  - `Delivery`
  - `StockTransferItem`
  - `StockReservationItem`
- Backend ajustado para gravar `tenantId` nessas entidades em fluxos de escrita.
- `tenant-audit` ampliado com validacoes de mismatch de `tenantId` nas tabelas filhas.
