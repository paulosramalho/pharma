// backend/src/modules/fiscal/utils/retry.js
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransient(err) {
  if (!err) return false;
  const sc = err.statusCode || err.httpStatus || err.http || null;
  // transient: 408/429/5xx/504, ou erros de rede
  if (sc === 408 || sc === 429 || sc === 500 || sc === 502 || sc === 503 || sc === 504) return true;
  const msg = String(err.message || "").toLowerCase();
  if (msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("ecanceled") || msg.includes("econnreset")) return true;
  return false;
}

// retry com backoff exponencial simples
async function withRetry(fn, { attempts = 3, baseDelayMs = 250, factor = 2, jitterMs = 80 } = {}) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i === attempts || !isTransient(err)) throw err;
      const delay = Math.round(baseDelayMs * (factor ** (i - 1)) + Math.random() * jitterMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

module.exports = { withRetry, isTransient };
