const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const PAGE = {
  size: "A4",
  marginLeft: 40,
  marginRight: 40,
  marginTop: 28,
  marginBottom: 28,
};

const HEADER = {
  logoY: 30,
  logoHeight: 30,
  systemNameY: 68,
  reportNameY: 96,
  separatorY: 116,
};

const FOOTER = {
  separatorYFromBottom: 68,
  line1YFromBottom: 56,
  line2YFromBottom: 40,
};

function formatDateTimeBR(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  return { date, time };
}

function getReportLogoPath() {
  const preferred = process.env.REPORT_LOGO_PNG_PATH || "C:\\Pharma\\Dep\u00F3sito\\LogoPharma.PNG";
  if (fs.existsSync(preferred)) return preferred;
  const fallback = path.resolve(__dirname, "../../../..", "frontend/public/brand/LogoPharma.PNG");
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

function drawHeader(doc, { reportName, systemName }) {
  const width = doc.page.width;
  const centerX = width / 2;
  const left = PAGE.marginLeft;
  const right = width - PAGE.marginRight;

  const logoPath = getReportLogoPath();
  if (logoPath) {
    const logoWidth = HEADER.logoHeight;
    doc.image(logoPath, centerX - (logoWidth / 2), HEADER.logoY, {
      fit: [logoWidth, HEADER.logoHeight],
      align: "center",
      valign: "center",
    });
  }

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(11).text(systemName, left, HEADER.systemNameY, {
    width: right - left,
    align: "center",
  });

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text(reportName, left, HEADER.reportNameY, {
    width: right - left,
    align: "left",
  });

  doc.moveTo(left, HEADER.separatorY).lineTo(right, HEADER.separatorY).lineWidth(1).strokeColor("#9ca3af").stroke();
}

function drawFooter(doc, { emittedAt, emittedBy, pageNumber, totalPages }) {
  const width = doc.page.width;
  const height = doc.page.height;
  const left = PAGE.marginLeft;
  const right = width - PAGE.marginRight;
  const sepY = height - FOOTER.separatorYFromBottom;
  const line1Y = height - FOOTER.line1YFromBottom;
  const line2Y = height - FOOTER.line2YFromBottom;
  const { date, time } = formatDateTimeBR(emittedAt);

  doc.moveTo(left, sepY).lineTo(right, sepY).lineWidth(1).strokeColor("#9ca3af").stroke();

  doc.fillColor("#374151").font("Helvetica").fontSize(9).text(`Emitido em ${date} as ${time}`, left, line1Y, {
    width: right - left - 120,
    align: "left",
  });
  doc.text(`Pagina: ${pageNumber}/${totalPages}`, left, line1Y, {
    width: right - left,
    align: "right",
  });

  doc.text(`Emitido por ${emittedBy || "-"}`, left, line2Y, {
    width: right - left,
    align: "left",
  });
}

function buildSampleBody(doc) {
  const left = PAGE.marginLeft;
  const right = doc.page.width - PAGE.marginRight;
  const contentTop = HEADER.separatorY + 14;
  const contentBottom = doc.page.height - FOOTER.separatorYFromBottom - 10;
  const usableWidth = right - left;

  doc.y = contentTop;
  doc.font("Helvetica").fontSize(10).fillColor("#111827");
  doc.text("Amostra de conteudo para validacao do padrao de PDF.", left, doc.y, { width: usableWidth });
  doc.moveDown(0.8);

  for (let i = 1; i <= 95; i += 1) {
    if (doc.y > contentBottom) {
      doc.addPage();
      doc.y = contentTop;
    }
    doc.text(`Linha ${String(i).padStart(2, "0")} - Conteudo de exemplo do relatorio.`, left, doc.y, {
      width: usableWidth,
    });
  }
}

function buildLinesBody(doc, { sections = [] }) {
  const left = PAGE.marginLeft;
  const right = doc.page.width - PAGE.marginRight;
  const contentTop = HEADER.separatorY + 14;
  const contentBottom = doc.page.height - FOOTER.separatorYFromBottom - 10;
  const usableWidth = right - left;

  doc.y = contentTop;
  for (const section of sections) {
    const title = String(section?.title || "").trim();
    if (title) {
      if (doc.y > contentBottom - 20) {
        doc.addPage();
        doc.y = contentTop;
      }
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(title, left, doc.y, { width: usableWidth });
      doc.moveDown(0.4);
    }

    const lines = Array.isArray(section?.lines) ? section.lines : [];
    for (const raw of lines) {
      const line = String(raw || "").trim();
      if (!line) continue;
      if (doc.y > contentBottom - 14) {
        doc.addPage();
        doc.y = contentTop;
      }
      doc.font("Helvetica").fontSize(9.5).fillColor("#111827").text(line, left, doc.y, { width: usableWidth });
    }

    doc.moveDown(0.6);
  }
}

function makeReportSamplePdfBuffer({ reportName, emittedBy, systemName = "Pharma", emittedAt = new Date() }) {
  const pdf = new PDFDocument({
    size: PAGE.size,
    margins: {
      top: PAGE.marginTop,
      right: PAGE.marginRight,
      bottom: PAGE.marginBottom,
      left: PAGE.marginLeft,
    },
    bufferPages: true,
  });

  const chunks = [];
  pdf.on("data", (c) => chunks.push(c));

  return new Promise((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    buildSampleBody(pdf);

    const range = pdf.bufferedPageRange();
    const totalPages = range.count;
    for (let i = 0; i < totalPages; i += 1) {
      pdf.switchToPage(i);
      drawHeader(pdf, { reportName, systemName });
      drawFooter(pdf, {
        emittedAt,
        emittedBy,
        pageNumber: i + 1,
        totalPages,
      });
    }

    pdf.end();
  });
}

function makeReportLinesPdfBuffer({ reportName, emittedBy, sections = [], systemName = "Pharma", emittedAt = new Date() }) {
  const pdf = new PDFDocument({
    size: PAGE.size,
    margins: {
      top: PAGE.marginTop,
      right: PAGE.marginRight,
      bottom: PAGE.marginBottom,
      left: PAGE.marginLeft,
    },
    bufferPages: true,
  });

  const chunks = [];
  pdf.on("data", (c) => chunks.push(c));

  return new Promise((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    buildLinesBody(pdf, { sections });

    const range = pdf.bufferedPageRange();
    const totalPages = range.count;
    for (let i = 0; i < totalPages; i += 1) {
      pdf.switchToPage(i);
      drawHeader(pdf, { reportName, systemName });
      drawFooter(pdf, {
        emittedAt,
        emittedBy,
        pageNumber: i + 1,
        totalPages,
      });
    }

    pdf.end();
  });
}

module.exports = { makeReportSamplePdfBuffer, makeReportLinesPdfBuffer };
