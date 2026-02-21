# Modelo PDF de Relatorios

## Implementacao atual

- Modulo: `backend/src/modules/reports/reportPdfTemplate.js`
- Endpoint de amostra: `GET /api/reports/sample-pdf`

## Cabecalho (todas as paginas)

- Logomarca centralizada (arquivo principal: `C:\Pharma\Depósito\LogoPharma.PNG`).
- Nome do sistema centralizado na linha abaixo.
- Nome do relatorio alinhado a esquerda.
- Linha horizontal separando cabecalho e conteudo.

## Rodape (todas as paginas)

- Linha horizontal separando conteudo e rodape.
- Linha 1:
  - Esquerda: `Emitido em DD/MM/AAAA as HH:mm:ss`
  - Direita: `Pagina: X/Y`
- Linha 2:
  - Esquerda: `Emitido por <usuario>`

## Observacoes tecnicas

- Formato de pagina: A4.
- Geracao com `pdfkit`.
- O conteudo e renderizado primeiro e cabecalho/rodape sao aplicados em todas as paginas buffered.
- Fallback de logo para `frontend/public/brand/LogoPharma.PNG` caso o caminho principal nao exista.
