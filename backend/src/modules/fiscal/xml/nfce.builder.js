// backend/src/modules/fiscal/xml/nfce.builder.js
// Builder evolutivo (draft). Agora inclui:
// - infNFe/@Id = "NFe" + chave44
// - ide/cNF derivado da chave
// - ide/serie e ide/nNF

const { extractCNF } = require("../utils/nfce.key");

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildNfceXmlDraft({ cfg, input, accessKey, series, number, issueAt }) {
  const total = Number(input?.saleRef?.total || 0).toFixed(2);
  const discount = Number(input?.saleRef?.discount || 0).toFixed(2);
  const items = Array.isArray(input?.saleRef?.items) ? input.saleRef.items : [];

  const cnf = accessKey ? extractCNF(accessKey) : null;
  const tpAmb = cfg?.env === "PROD" ? "1" : "2";

  const detXml = items.map((it, idx) => {
    const nItem = idx + 1;
    return `
      <det nItem="${nItem}">
        <prod>
          <cProd>${esc(it.sku || nItem)}</cProd>
          <xProd>${esc(it.description || "ITEM")}</xProd>
          <qCom>${esc(it.qty ?? 1)}</qCom>
          <vUnCom>${esc(it.unitPrice ?? 0)}</vUnCom>
        </prod>
      </det>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="${accessKey ? "NFe" + esc(accessKey) : ""}" versao="4.00">
    <ide>
      <cUF>${esc(cfg?.ufCode || cfg?.uf || "")}</cUF>
      <cNF>${esc(cnf || "")}</cNF>
      <mod>65</mod>
      <serie>${esc(series ?? "")}</serie>
      <nNF>${esc(number ?? "")}</nNF>
      <dhEmi>${issueAt ? esc(new Date(issueAt).toISOString()) : ""}</dhEmi>
      <tpAmb>${tpAmb}</tpAmb>
    </ide>
    <emit>
      <CNPJ>${esc(cfg?.cnpj || "")}</CNPJ>
      <IE>${esc(cfg?.ie || "")}</IE>
    </emit>
    ${detXml}
    <total>
      <ICMSTot>
        <vProd>${esc(total)}</vProd>
        <vDesc>${esc(discount)}</vDesc>
        <vNF>${esc((Number(total) - Number(discount)).toFixed(2))}</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>`;
}

module.exports = { buildNfceXmlDraft };
