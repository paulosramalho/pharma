# Patch — Rejeições (catálogo) + Retry/Backoff + Auditoria de Envio

## O que entra
- Catálogo de erros fiscal (`FISCAL_*` e `SEFAZ_REJECT_###`)
- Retry/backoff no `/send` (somente para erros transitórios)
- Auditoria: grava `FiscalEvent` a cada tentativa e resultado
- MOCK: rejeições simuladas via `MOCK_SEFAZ_REJECT`

## Arquivos
- `backend/src/modules/fiscal/errors/httpError.js`
- `backend/src/modules/fiscal/errors/fiscalErrors.js`
- `backend/src/modules/fiscal/utils/retry.js`
- `backend/src/modules/fiscal/nfce.send.withRetry.js`
- `backend/src/modules/fiscal/providers/mock.provider.js` (sobrescreve)
- `backend/src/modules/fiscal/nfce.service.js` (sobrescreve)

## Variáveis de ambiente (opcionais)
```env
SEFAZ_RETRY_ATTEMPTS=3
SEFAZ_RETRY_BASE_DELAY_MS=250

# MOCK: simular rejeições
MOCK_SEFAZ_REJECT=NONE
# MOCK_SEFAZ_REJECT=351
# MOCK_SEFAZ_REJECT=RANDOM
# MOCK_SEFAZ_REJECT=SEQUENCE:351,999,0
```

## Teste rápido (rejeição)
1) setar no `.env`:
`MOCK_SEFAZ_REJECT=351`
2) reiniciar backend
3) fazer `/send` em um doc SIGNED
4) esperado: HTTP 422 e erro:
- `code = SEFAZ_REJECT_351`
- `message` com a rejeição

## Conferência no DB
```sql
SELECT "type","message","createdAt"
FROM "FiscalEvent"
WHERE "docId"='<DOC_ID>'
ORDER BY "createdAt" DESC
LIMIT 20;
```
