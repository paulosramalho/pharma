# Migracao Tecnica TenantId Ponta a Ponta

Data base: 2026-02-22

## Objetivo
Concluir isolamento multi-tenant em banco unico (shared DB), com garantia de:
- escopo por `tenantId` no backend;
- performance via indices compostos;
- trilha de auditoria de licenca por tenant;
- validacao automatica de consistencia cross-tenant.

## Estado atual
- Entidades centrais com `tenantId`: `Tenant`, `TenantLicense`, `TenantLicenseAudit`, `Store`, `User`, `Category`, `Product`, `Customer`, `Sale`, `CashSession`, `StockTransfer`, `StockReservation`, `ChatMessage`, `AuditLog`.
- Rotas criticas reforcadas com filtro de tenant no backend.
- Auditoria de alteracao de licenca implementada em `PUT /api/license/me`.
- Indices compostos com tenant ja aplicados em pontos de maior carga.

## Fase 1 (ja executada)
1. Introducao de `tenantId` nas entidades maes + backfill.
2. Endpoint de licenca por tenant + auditoria (`TenantLicenseAudit`).
3. Hardening das rotas criticas para nao aceitar acesso cruzado.
4. Indices compostos iniciais e complementares.

## Fase 2 (executada no codigo; executar validacao no ambiente)
1. Rodar auditoria de consistencia:
   - comando: `npm.cmd run tenant:audit` (em `backend`).
2. Corrigir quaisquer linhas com `FAIL` no relatorio antes de enforcement total.
3. Validar cenarios de seguranca:
   - usuario tenant A nao acessa vendas/transferencias/reservas do tenant B por ID.
   - POS e chat respeitam tenant.
4. Rodar testes de regressao funcional (vendas, caixa, estoque, transferencias, reservas, relatorios).

## Fase 3 (enforcement forte no banco - implementado)
1. Introduzir `tenantId` nas tabelas filhas de alta criticidade:
   - `InventoryLot`, `InventoryMovement`, `SaleItem`, `Payment`, `PosTransaction`, `StockTransferItem`, `StockReservationItem`, `Discount`, `Delivery`, `Address`.
2. Backfill com joins a partir da entidade pai.
3. Criar FKs para `Tenant(id)` e indices `tenantId + chave de busca`.
4. Tornar `tenantId` `NOT NULL` nas tabelas filhas.

### Entregas implementadas
- Migration criada:
  - `backend/prisma/migrations/20260222183000_tenant_children_enforcement/migration.sql`
- Schema Prisma atualizado para refletir tenant nas tabelas filhas.
- Backend ajustado para preencher `tenantId` nos fluxos de escrita (vendas, estoque, transferencias, reservas e POS).
- Auditoria ampliada com checks de mismatch de `tenantId` nas tabelas filhas.

## Fase 4 (unicidade por tenant)
1. Revisar unicidades globais que devem ser por tenant:
   - `User.email`, `Customer.document`, `Product.ean`, `Category.name`.
2. Migrar para constraints compostas (`tenantId`, campo) quando regra de negocio exigir reutilizacao entre tenants.
3. Ajustar busca/login para novo padrao de unicidade (quando adotado).

## Fase 5 (blindagem operacional)
1. Incluir `tenant:audit` em pipeline de deploy.
2. Bloquear deploy quando houver `FAIL` em consistencia cross-tenant.
3. Instrumentar alerta para tentativas de acesso cross-tenant (403/404 com metricas).

## Rollout recomendado
1. Homologacao:
   - aplicar migrations;
   - rodar `tenant:audit`;
   - executar suite funcional.
2. Producao:
   - janela curta de migracao;
   - aplicar migration;
   - `tenant:audit` pos-migracao;
   - liberar trafego gradualmente.

## Critério de pronto
- `tenant:audit` com `Total issues: 0`.
- sem regressao funcional em fluxos criticos.
- nenhuma rota critica retornando dados de outro tenant.
