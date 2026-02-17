# Patch — GET /fiscal/errors (catálogo para o Front)

## Objetivo
Entregar um endpoint simples para o front consumir e mapear mensagens/ações de UI por `error.code`.

## Endpoint
- `GET /fiscal/errors`

Retorno:
```json
{
  "ok": true,
  "errors": [
    { "http": 404, "code": "FISCAL_DOC_NOT_FOUND", "message": "..." },
    { "http": 422, "code": "SEFAZ_REJECT_###", "message": "..." }
  ],
  "requestId": "..."
}
```

## Arquivos
- `backend/src/modules/fiscal/errors/catalog.js`
- `backend/src/modules/fiscal/fiscal.errors.routes.js`

## Montagem da rota (1 linha)
No `server.js`:
```js
const { buildFiscalErrorsRoutes } = require("./modules/fiscal/fiscal.errors.routes");
app.use("/fiscal", buildFiscalErrorsRoutes());
```

## Teste
Abra:
- `http://localhost:3000/fiscal/errors`
