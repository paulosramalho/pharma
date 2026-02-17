const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * Simple forecasting helpers (MVP)
 * - SMA: Simple Moving Average
 * - EMA: Exponential Moving Average
 *
 * Input series: [{ date: 'YYYY-MM-DD', qty: number }]
 */
function sma(series, window = 7) {
  const w = clamp(Number(window || 7), 1, 60);
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - w + 1);
    const slice = series.slice(start, i + 1);
    const avg = slice.reduce((acc, p) => acc + Number(p.qty || 0), 0) / slice.length;
    out.push({ date: series[i].date, value: Number(avg.toFixed(4)) });
  }
  return out;
}

function ema(series, window = 14) {
  const w = clamp(Number(window || 14), 1, 120);
  const alpha = 2 / (w + 1);
  const out = [];
  let prev = null;
  for (let i = 0; i < series.length; i++) {
    const x = Number(series[i].qty || 0);
    const v = prev === null ? x : alpha * x + (1 - alpha) * prev;
    prev = v;
    out.push({ date: series[i].date, value: Number(v.toFixed(4)) });
  }
  return out;
}

function forecastNext({ series, method = "SMA", window = 7, horizonDays = 14 }) {
  const horizon = clamp(Number(horizonDays || 14), 1, 60);
  if (!Array.isArray(series) || series.length === 0) return { method, window, horizon, forecast: [] };

  const lastDate = series[series.length - 1].date;
  const base = (String(method || "SMA").toUpperCase() === "EMA") ? ema(series, window) : sma(series, window);
  const lastValue = base[base.length - 1]?.value ?? 0;

  // naive horizon: repeat last smoothed value
  const forecast = [];
  const d0 = new Date(lastDate + "T00:00:00Z");
  for (let i = 1; i <= horizon; i++) {
    const di = new Date(d0.getTime() + i * 86400000);
    const yyyy = di.getUTCFullYear();
    const mm = String(di.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(di.getUTCDate()).padStart(2, "0");
    forecast.push({ date: `${yyyy}-${mm}-${dd}`, value: Number(lastValue.toFixed(4)) });
  }

  return { method: String(method || "SMA").toUpperCase(), window: Number(window || 7), horizon, forecast };
}

module.exports = { sma, ema, forecastNext };
