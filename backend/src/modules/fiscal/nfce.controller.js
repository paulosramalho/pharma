// backend/src/modules/fiscal/nfce.controller.js
const { nfceService } = require("./nfce.service");

function nfceController() {}

nfceController.prepare = ({ prisma, log }) => async (req, res, next) => {
  try {
    const out = await nfceService.prepare({ prisma, log, input: req.body, requestId: req.requestId });
    res.json(out);
  } catch (e) { next(e); }
};

nfceController.sign = ({ prisma, log }) => async (req, res, next) => {
  try {
    const out = await nfceService.sign({ prisma, log, id: req.params.id, requestId: req.requestId });
    res.json(out);
  } catch (e) { next(e); }
};

nfceController.send = ({ prisma, log }) => async (req, res, next) => {
  try {
    const out = await nfceService.send({ prisma, log, id: req.params.id, requestId: req.requestId });
    res.json(out);
  } catch (e) { next(e); }
};

nfceController.cancel = ({ prisma, log }) => async (req, res, next) => {
  try {
    const out = await nfceService.cancel({ prisma, log, id: req.params.id, input: req.body, requestId: req.requestId });
    res.json(out);
  } catch (e) { next(e); }
};

nfceController.get = ({ prisma, log }) => async (req, res, next) => {
  try {
    const out = await nfceService.get({ prisma, log, id: req.params.id, requestId: req.requestId });
    res.json(out);
  } catch (e) { next(e); }
};

module.exports = { nfceController };
