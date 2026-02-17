# Patch — Padronização total de respostas (módulo fiscal)

## Objetivo
Padronizar respostas do módulo fiscal para facilitar o front e debugging:

**Sucesso**
```json
{ "ok": true, "data": { ... }, "requestId": "..." }
```

**Erro**
```json
{ "error": { "code": "...", "message": "...", "details": {...} }, "requestId": "..." }
```

## Arquivos
- `backend/src/common/http/asyncHandler.js`
- `backend/src/common/http/response.js`
- `backend/src/modules/fiscal/fiscal.response.middleware.js`
- `backend/src/modules/fiscal/fiscal.error.middleware.js` (opcional: handler só do fiscal)

## Como ligar (mínimo — 2 linhas no server.js)
No `server.js`, antes de montar as rotas fiscais:

```js
const { fiscalResponseMiddleware } = require("./modules/fiscal/fiscal.response.middleware");
app.use("/fiscal", fiscalResponseMiddleware());
```

Se você quiser handler isolado para fiscal (opcional), após montar rotas do fiscal:
```js
const { fiscalErrorMiddleware } = require("./modules/fiscal/fiscal.error.middleware");
app.use("/fiscal", fiscalErrorMiddleware({ log }));
```

> Se você já tem um **error handler global** bem formado, pode não usar o `fiscalErrorMiddleware`.

## Como usar nas rotas novas
Exemplo:
```js
const { asyncHandler } = require("../../common/http/asyncHandler");

router.get("/algo", asyncHandler(async (req, res) => {
  const x = await doSomething();
  return res.ok({ x });
}));
```

Para erro:
```js
throw httpError(422, "SEFAZ_REJECT_351", "Rejeição ...", { ... })
```
(chega no handler e volta padronizado)
