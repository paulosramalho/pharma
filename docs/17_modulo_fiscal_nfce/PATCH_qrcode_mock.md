# Patch — QRCode + URL de Consulta (MOCK) — NFC-e

## Objetivo
Em modo DEV/MOCK, gerar uma **URL de consulta** determinística para a NFC-e e gravar em `FiscalDocument.qrCodeUrl` no momento do `/send` (MOCK).

## Arquivos
- `backend/src/modules/fiscal/qr/qrCode.js` (novo)
- `backend/src/modules/fiscal/providers/mock.provider.js` (substitui)

## Como aplicar
1) Extrair o ZIP em `C:\pharma` (sobrescreve o mock.provider.js)
2) Reiniciar o backend.

## Teste
1) `POST /fiscal/nfce/prepare`
2) `POST /fiscal/nfce/{id}/send` (MOCK)
3) Verifique:
   - resposta contém `doc.qrCodeUrl`
   - no banco:
```sql
SELECT "id","status","accessKey","qrCodeUrl"
FROM "FiscalDocument"
ORDER BY "createdAt" DESC
LIMIT 5;
```

## Observação
No ambiente real, o QRCode depende de CSC e de endpoints oficiais por UF (homolog/prod).
Aqui é um placeholder **para destravar frontend e fluxo operacional**.
