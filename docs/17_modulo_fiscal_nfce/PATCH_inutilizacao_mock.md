# Patch — Inutilização de Numeração NFC-e (MOCK)

## Endpoint
`POST /fiscal/nfce/inutilize`

Body:
```json
{
  "storeId": "<uuid>",
  "series": 1,
  "nStart": 10,
  "nEnd": 15,
  "reason": "Motivo com no mínimo 15 caracteres..."
}
```

## Regras
- `nStart <= nEnd` e ambos >= 1
- `series` 1..999
- `reason` mínimo 15 chars
- intervalo máximo por chamada: 100 (DEV safeguard)
- não pode inutilizar número já usado em `FiscalDocument` (store + series + number)

## Gravação
- cria `FiscalEvent` com:
  - `type = INUTILIZACAO`
  - `payload` com evidências do mock

## Montagem da rota (1 linha)
No `server.js` (ou router fiscal):

```js
const { buildNfceInutilizeRoutes } = require("./modules/fiscal/nfce.inutilize.routes");
app.use("/fiscal", buildNfceInutilizeRoutes({ prisma, log }));
```

## Teste (PowerShell)
```powershell
$body = @{
  storeId = "42d500a4-c96d-4287-ae5d-d7477d623a84"
  series  = 1
  nStart  = 10
  nEnd    = 12
  reason  = "Correção de numeração em ambiente de teste (MOCK)."
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/fiscal/nfce/inutilize" -ContentType "application/json" -Body $body
```

## SQL
```sql
SELECT "id","type","message","createdAt"
FROM "FiscalEvent"
WHERE "type"='INUTILIZACAO'
ORDER BY "createdAt" DESC
LIMIT 10;
```
