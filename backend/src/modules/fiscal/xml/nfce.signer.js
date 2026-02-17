// backend/src/modules/fiscal/xml/nfce.signer.js
// Assinatura XMLDSIG (enveloped) para NFC-e / NF-e 4.00
// Requer <infNFe Id="NFe{chave44}" ...>
//
// Dependências:
//   npm i xml-crypto @xmldom/xmldom node-forge
//
// DEV: FISCAL_SIGNER=MOCK retorna XML sem assinatura.

const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const { SignedXml } = require("xml-crypto");
const { readPfxAsPem } = require("./pfx");

function getInfNFeId(doc) {
  const nodes = doc.getElementsByTagName("infNFe");
  if (!nodes || !nodes.length) return null;
  return nodes[0].getAttribute("Id") || null;
}

function addIdAttributeSupport(signedXml) {
  signedXml.idAttributes = ["Id"];
}

async function signNfceXmlA1Pfx({ xml, pfxPath, pfxPassword }) {
  const mode = String(process.env.FISCAL_SIGNER || "").toUpperCase();
  if (mode === "MOCK") return xml;

  const { privateKeyPem, certPem } = readPfxAsPem({ pfxPath, pfxPassword });

  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const infId = getInfNFeId(doc);
  if (!infId) {
    const e = new Error('XML sem infNFe/@Id. Esperado: Id="NFe{chave44}". Refaça o prepare com chave 44.');
    e.statusCode = 400;
    throw e;
  }

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    keyInfoProvider: {
      getKeyInfo() {
        const b64 = certPem
          .replace("-----BEGIN CERTIFICATE-----", "")
          .replace("-----END CERTIFICATE-----", "")
          .replace(/\s+/g, "");
        return `<X509Data><X509Certificate>${b64}</X509Certificate></X509Data>`;
      },
    },
  });

  addIdAttributeSupport(sig);

  sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";

  sig.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
    idAttribute: "Id",
    uri: "#" + infId,
  });

  sig.computeSignature(new XMLSerializer().serializeToString(doc), {
    location: {
      reference: "//*[local-name(.)='infNFe']",
      action: "after",
    },
  });

  return sig.getSignedXml();
}

module.exports = { signNfceXmlA1Pfx };
