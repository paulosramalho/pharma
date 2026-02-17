# Módulo Fiscal / NFC-e (Sprint Fiscal 1 — Scaffold)

## Estado atual (este pacote)
- Persistência local de NFC-e (FiscalDocument) + Config por loja (FiscalConfig)
- Rotas e fluxo:
  - POST /fiscal/nfce/prepare  -> cria DRAFT com XML base
  - POST /fiscal/nfce/:id/sign -> tentativa de assinar (ainda 501)
  - POST /fiscal/nfce/:id/send -> envia via provider (MOCK por padrão)
- Provider:
  - MOCK: autoriza e retorna status AUTHORIZED (sem SEFAZ)

## Referências técnicas (para implementação real)
- MOC (Manual de Orientação ao Contribuinte) NF-e/NFC-e v7 + NTs (layout/assinatura/QR) — Portal NF-e.
- CSC (Código de Segurança do Contribuinte) é exigido para QRCode do DANFE NFC-e (fornecido pela SEFAZ).
- URLs e WS variam por UF e por autorizador (SVRS/SVAN/SEFAZ própria).

## Próximo patch deste módulo (entrega técnica)
1) Implementar assinatura XMLDSIG para infNFe (A1 PFX)
2) Implementar geração de chave 44 + dígito verificador
3) Implementar QRCode (CSC) conforme MOC/NT
4) Implementar provider SEFAZ (SOAP, TLS, endpoints por UF/autorizador)
5) Implementar cancelamento (evento 110111) + consulta status

## Como instalar este pacote no projeto
1) Extrair o ZIP em C:\pharma
2) Aplicar o patch do schema (ver `backend/prisma/schema.patch.add_nfce_models.prisma`)
3) Rodar:
   - npx prisma migrate dev -n fiscal_nfce_init
4) Montar o router em server.js:
   - app.use("/fiscal", buildFiscalRouter({ prisma, log }))

## Variáveis de ambiente úteis
- FISCAL_PROVIDER=MOCK (padrão) | SEFAZ (futuro)
