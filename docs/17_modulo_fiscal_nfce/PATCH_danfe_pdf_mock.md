# Patch — DANFE NFC-e (PDF) — MOCK/DEV

## Objetivo
Gerar um PDF simples (80mm) para impressão no balcão:
- cabeçalho loja/ambiente
- chave de acesso
- itens (extraídos do XML draft, quando existirem)
- total
- QRCode (a partir de doc.qrCodeUrl)
- aviso DEV/MOCK

## Arquivos
- `backend/src/modules/fiscal/danfe/danfePdf.js`
- `backend/src/modules/fiscal/danfe/danfe.routes.js`

## Dependências
No backend:
```bash
npm i pdfkit qrcode
```

## Montagem de rotas (1 linha)
No `backend/src/modules/fiscal/index.js` (ou onde você monta o router fiscal),
adicione:

```js
const { buildDanfeRoutes } = require("./danfe/danfe.routes");
app.use("/fiscal", buildDanfeRoutes({ prisma, log }));
```

> Se você já usa `buildFiscalRouter`, dentro dele faça:  
> `router.use(buildDanfeRoutes({ prisma, log }))`.

## Endpoint
- `GET /fiscal/nfce/:id/danfe.pdf`

## Teste
1) Prepare + send (MOCK)
2) Abra no navegador:
`http://localhost:3000/fiscal/nfce/<DOC_ID>/danfe.pdf`
