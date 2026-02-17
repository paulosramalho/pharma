// backend/src/modules/fiscal/fiscal.response.middleware.js
// Padroniza resposta no módulo fiscal:
// res.ok(data[,status])
// res.fail(err)
// E expõe req.requestId (já vem do middleware global).

const { sendOk, sendError } = require("../../common/http/response"); // path corrigido no require abaixo

function fiscalResponseMiddleware() {
  return (req, res, next) => {
    res.ok = (data, status) => sendOk(res, req, data, status);
    res.fail = (err) => sendError(res, req, err);
    next();
  };
}

module.exports = { fiscalResponseMiddleware };
