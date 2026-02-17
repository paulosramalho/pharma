# Patch — Chave 44 + DV (NFC-e)

## O que este patch faz
- Cria numeração sequencial por loja (FiscalSequence):
  - serie = 1 (por enquanto)
  - nNF incremental por store
- Gera chave de acesso 44 com DV (módulo 11)
- Preenche `FiscalDocument.series`, `FiscalDocument.number`, `FiscalDocument.issueAt`, `FiscalDocument.accessKey`
- Atualiza o XML draft para:
  - `infNFe/@Id = "NFe" + chave44`
  - `ide/cNF` extraído da chave
  - `ide/serie`, `ide/nNF`, `ide/dhEmi`

## Como aplicar
1) Extrair o ZIP em `C:\pharma`
2) Aplicar patch Prisma:
   - Cole `backend/prisma/schema.patch.add_fiscal_sequence.prisma` no FINAL do `backend/prisma/schema.prisma`
3) Rodar migração:
   - `npx prisma migrate dev -n fiscal_sequence_nfce`
4) Reiniciar o servidor.

## Teste
- Faça `POST /fiscal/nfce/prepare`.
- Verifique que o retorno agora tem:
  - `doc.series`, `doc.number`, `doc.accessKey`
