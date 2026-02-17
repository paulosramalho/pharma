# Patch — Assinatura XMLDSIG (A1 PFX) — NFC-e

## Objetivo
Assinar o XML da NFC-e (NF-e 4.00) no nó `infNFe` usando certificado A1 (arquivo `.pfx`).

## Arquivos
- `backend/src/modules/fiscal/xml/pfx.js`
- `backend/src/modules/fiscal/xml/nfce.signer.js`

## Dependências (backend)
Rode em `C:\pharma\backend`:
```bash
npm i xml-crypto @xmldom/xmldom node-forge
```

## Configuração (FiscalConfig)
Preencher na tabela `FiscalConfig` (por store):
- `certPfxPath` = caminho completo do `.pfx` (ex.: `C:\pharma\certs\certificado.pfx`)
- `certPassword` = senha do PFX

## Modo DEV
- `FISCAL_SIGNER=MOCK` mantém fluxo sem assinatura real.

## Teste (assinatura real)
1) Configure cert no FiscalConfig e remova `FISCAL_SIGNER=MOCK`.
2) Rode:
   - `POST /fiscal/nfce/{id}/sign`
3) Verifique que o XML contém `<Signature>` e `Reference URI="#NFe{chave}"`.
