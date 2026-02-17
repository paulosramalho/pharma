// backend/src/modules/fiscal/danfe/danfePdf.js
// DANFE NFC-e (PDF) — MOCK/DEV
// Gera um PDF simples para impressão no balcão, baseado no FiscalDocument (NFCE).
// Dependências: pdfkit, qrcode
//
// Este DANFE é um "layout mínimo" para destravar operação:
// - Cabeçalho (Loja / CNPJ / UF / Ambiente)
// - Chave de acesso
// - Itens (mock)
// - Totais (mock)
// - QRCode (a partir de doc.qrCodeUrl)

const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

function moneyBR(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function makeDanfeNfcePdfBuffer({ doc, store, cfg }) {
  const pdf = new PDFDocument({
    size: [226.8, 800], // ~80mm largura (em pontos). altura ajustada depois com "end" (pdfkit aceita)
    margins: { top: 12, left: 10, right: 10, bottom: 12 },
  });

  const chunks = [];
  pdf.on("data", (c) => chunks.push(c));

  const done = new Promise((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  const envLabel = cfg?.env === "PROD" ? "PRODUÇÃO" : "HOMOLOGAÇÃO";
  const title = "DANFE NFC-e (DEV)";
  const storeName = store?.name || "Loja";
  const cnpj = cfg?.cnpj || "";
  const uf = cfg?.uf || "";
  const accessKey = doc?.accessKey || "";
  const protocol = doc?.protocol || "";
  const issuedAt = doc?.issueAt ? new Date(doc.issueAt).toLocaleString("pt-BR") : "";

  // Header
  pdf.fontSize(10).text(title, { align: "center" });
  pdf.moveDown(0.3);
  pdf.fontSize(9).text(storeName, { align: "center" });
  pdf.fontSize(8).text(`CNPJ: ${cnpj}`, { align: "center" });
  pdf.fontSize(8).text(`UF: ${uf}  |  Ambiente: ${envLabel}`, { align: "center" });
  pdf.moveDown(0.5);
  pdf.moveTo(pdf.page.margins.left, pdf.y).lineTo(pdf.page.width - pdf.page.margins.right, pdf.y).stroke();
  pdf.moveDown(0.5);

  // Identificação
  pdf.fontSize(8).text(`Emissão: ${issuedAt}`);
  if (protocol) pdf.fontSize(8).text(`Protocolo: ${protocol}`);
  pdf.moveDown(0.3);
  pdf.fontSize(8).text("Chave de Acesso:", { underline: true });
  pdf.fontSize(8).text(accessKey, { width: 200 });
  pdf.moveDown(0.5);

  // Itens (Mock: tentamos parsear do XML draft, mas mantemos mínimo)
  pdf.fontSize(8).text("Itens:", { underline: true });
  pdf.moveDown(0.2);

  // Extração MUITO simples dos itens (se existirem no XML)
  const xml = String(doc?.xml || "");
  const itemMatches = [...xml.matchAll(/<xProd>(.*?)<\/xProd>[\s\S]*?<qCom>(.*?)<\/qCom>[\s\S]*?<vUnCom>(.*?)<\/vUnCom>/g)]
    .map((m) => ({ desc: m[1], qty: m[2], unit: m[3] }))
    .slice(0, 50);

  if (!itemMatches.length) {
    pdf.fontSize(8).text("- (itens não informados no mock)");
  } else {
    itemMatches.forEach((it, idx) => {
      pdf.fontSize(8).text(`${idx + 1}. ${it.desc}`);
      pdf.fontSize(8).text(`   ${it.qty} x ${it.unit}`);
    });
  }

  pdf.moveDown(0.5);
  pdf.moveTo(pdf.page.margins.left, pdf.y).lineTo(pdf.page.width - pdf.page.margins.right, pdf.y).stroke();
  pdf.moveDown(0.5);

  // Totais (mock via XML: vNF)
  let vNF = null;
  const mVnf = xml.match(/<vNF>(.*?)<\/vNF>/);
  if (mVnf) vNF = mVnf[1];

  pdf.fontSize(9).text(`Total NFC-e: R$ ${moneyBR(vNF)}`, { align: "right" });
  pdf.moveDown(0.6);

  // QRCode
  if (doc?.qrCodeUrl) {
    pdf.fontSize(8).text("Consulta via QRCode:", { align: "center" });
    const dataUrl = await QRCode.toDataURL(doc.qrCodeUrl, { margin: 1, scale: 4 });
    const b64 = dataUrl.split(",")[1];
    const img = Buffer.from(b64, "base64");
    const x = (pdf.page.width - 120) / 2;
    pdf.image(img, x, pdf.y, { width: 120 });
    pdf.moveDown(6);
    pdf.fontSize(7).text(doc.qrCodeUrl, { align: "center" });
  } else {
    pdf.fontSize(8).text("(Sem qrCodeUrl)", { align: "center" });
  }

  pdf.moveDown(0.8);
  pdf.fontSize(7).text("Documento gerado em DEV/MOCK. Não possui validade fiscal.", { align: "center" });

  pdf.end();
  return done;
}

module.exports = { makeDanfeNfcePdfBuffer };
