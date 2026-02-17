// backend/src/modules/fiscal/xml/pfx.js
// Utilitário: extrair chave privada e certificado (PEM) de um PFX (A1).
// Dependências: node-forge
const fs = require("fs");
const forge = require("node-forge");

function readPfxAsPem({ pfxPath, pfxPassword }) {
  if (!pfxPath) {
    const e = new Error("pfxPath obrigatório");
    e.statusCode = 400;
    throw e;
  }
  const bin = fs.readFileSync(pfxPath);
  const p12Der = forge.util.createBuffer(bin.toString("binary"), "binary");
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pfxPassword || "");
  } catch (err) {
    const e = new Error("Falha ao ler PFX. Verifique caminho e senha.");
    e.statusCode = 400;
    throw e;
  }

  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];

  if (!keyBags || !keyBags.length) {
    const e = new Error("PFX não contém chave privada.");
    e.statusCode = 400;
    throw e;
  }

  const privateKeyPem = forge.pki.privateKeyToPem(keyBags[0].key);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  if (!certBags || !certBags.length) {
    const e = new Error("PFX não contém certificado.");
    e.statusCode = 400;
    throw e;
  }

  const certPem = forge.pki.certificateToPem(certBags[0].cert);
  return { privateKeyPem, certPem };
}

module.exports = { readPfxAsPem };
