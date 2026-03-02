/* ============================================================
   data.js – Simulated stock data engine + technical indicators
   ============================================================ */

const STOCKS = {
  AAPL:  { name: 'Apple Inc.',          sector: 'Technology',    base: 189 },
  TSLA:  { name: 'Tesla Inc.',          sector: 'Automotive',    base: 245 },
  MSFT:  { name: 'Microsoft Corp.',     sector: 'Technology',    base: 415 },
  GOOGL: { name: 'Alphabet Inc.',       sector: 'Technology',    base: 175 },
  AMZN:  { name: 'Amazon.com Inc.',     sector: 'E-Commerce',    base: 192 },
  NVDA:  { name: 'NVIDIA Corp.',        sector: 'Semiconductors',base: 875 },
  META:  { name: 'Meta Platforms',      sector: 'Social Media',  base: 522 },
  JPM:   { name: 'JPMorgan Chase',      sector: 'Banking',       base: 195 },
  BRK:   { name: 'Berkshire Hathaway',  sector: 'Conglomerate',  base: 365 },
  V:     { name: 'Visa Inc.',           sector: 'Fintech',       base: 278 },
  WMT:   { name: 'Walmart Inc.',        sector: 'Retail',        base: 68  },
  NFLX:  { name: 'Netflix Inc.',        sector: 'Streaming',     base: 645 },
  AMD:   { name: 'AMD Inc.',            sector: 'Semiconductors',base: 165 },
  INTC:  { name: 'Intel Corp.',         sector: 'Semiconductors',base: 25  },
  DIS:   { name: 'Walt Disney Co.',     sector: 'Entertainment', base: 113 },
};

// ── Seeded pseudo-random (reproducible) ─────────────────────
function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Generate OHLCV data ──────────────────────────────────────
function generateOHLCV(ticker, days = 365) {
  const info = STOCKS[ticker] || { base: 100 };
  let price = info.base;
  const rng = seededRng(ticker.charCodeAt(0) * 31337 + ticker.charCodeAt(1) * 7919);
  const data = [];
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const vol = (rng() - 0.5) * 0.032 + (rng() - 0.5) * 0.015;
    const trend = Math.sin(i / 60) * 0.0015;
    price = Math.max(price * (1 + vol + trend), 1);

    const open = price * (1 + (rng() - 0.5) * 0.008);
    const high = Math.max(open, price) * (1 + rng() * 0.012);
    const low  = Math.min(open, price) * (1 - rng() * 0.012);
    const volume = Math.floor((rng() * 50 + 10) * 1_000_000);

    data.push({
      date: date.toISOString().slice(0, 10),
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low:  +low.toFixed(2),
      close: +price.toFixed(2),
      volume
    });
  }
  return data;
}

// ── Technical Indicators ─────────────────────────────────────
function calcSMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return +(slice.reduce((a, b) => a + b, 0) / period).toFixed(2);
  });
}

function calcEMA(closes, period) {
  const k = 2 / (period + 1);
  let ema = [];
  let prev = null;
  closes.forEach((c, i) => {
    if (i === period - 1) {
      prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      ema.push(+prev.toFixed(2));
    } else if (i > period - 1) {
      prev = c * k + prev * (1 - k);
      ema.push(+prev.toFixed(2));
    } else {
      ema.push(null);
    }
  });
  return ema;
}

function calcRSI(closes, period = 14) {
  const rsi = new Array(period).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
  }
  return rsi;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => (v && ema26[i]) ? +(v - ema26[i]).toFixed(4) : null);
  const signalLine = calcEMA(macdLine.filter(v => v !== null), 9);
  const fullSignal = new Array(macdLine.length - signalLine.length).fill(null).concat(signalLine);
  const histogram = macdLine.map((v, i) => (v && fullSignal[i]) ? +(v - fullSignal[i]).toFixed(4) : null);
  return { macdLine, signalLine: fullSignal, histogram };
}

function calcBollingerBands(closes, period = 20, multiplier = 2) {
  const sma = calcSMA(closes, period);
  return closes.map((_, i) => {
    if (!sma[i]) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - sma[i]) ** 2, 0) / period);
    return {
      upper:  +(sma[i] + multiplier * std).toFixed(2),
      middle: sma[i],
      lower:  +(sma[i] - multiplier * std).toFixed(2),
    };
  });
}

// ── LSTM/GRU/Transformer "prediction" simulation ─────────────
function generatePredictions(ohlcv, modelType = 'lstm') {
  const closes = ohlcv.map(d => d.close);
  const rng = seededRng(modelType === 'lstm' ? 111 : modelType === 'gru' ? 222 : 333);

  // noise levels per model
  const noise = { lstm: 0.018, gru: 0.022, transformer: 0.014 };
  const nLevel = noise[modelType] || 0.018;

  const predicted = closes.map((c, i) => {
    if (i < 60) return null;
    const drift = (rng() - 0.48) * nLevel;
    return +(c * (1 + drift)).toFixed(2);
  });

  // Next-day prediction
  const last = closes[closes.length - 1];
  const nextDay = +(last * (1 + (rng() - 0.47) * nLevel)).toFixed(2);

  // Metrics
  const valid = predicted.filter(Boolean);
  const actual = closes.slice(predicted.indexOf(valid[0]));
  let rmse = 0, mae = 0;
  valid.forEach((p, i) => {
    const err = p - actual[i];
    rmse += err * err;
    mae += Math.abs(err);
  });
  rmse = +(Math.sqrt(rmse / valid.length)).toFixed(2);
  mae  = +(mae / valid.length).toFixed(2);
  const mape = +((mae / (closes.reduce((a, b) => a + b, 0) / closes.length)) * 100).toFixed(2);
  const r2   = +(1 - rmse * rmse / (closes.slice(-valid.length).reduce((s, v, i, a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return s + (v - m) * (v - m);
  }, 0) / valid.length || 1)).toFixed(3);

  const confidence = Math.max(60, Math.min(97, 100 - rmse / last * 100 * 3));

  return { predicted, nextDay, rmse, mae, mape, r2, confidence: +confidence.toFixed(1) };
}

// ── Loss curve ───────────────────────────────────────────────
function generateLossCurve(epochs = 50) {
  const rng = seededRng(42);
  const trainLoss = [], valLoss = [];
  let tl = 0.8, vl = 0.9;
  for (let e = 0; e < epochs; e++) {
    tl = Math.max(tl * (0.93 + rng() * 0.04), 0.015);
    vl = Math.max(vl * (0.94 + rng() * 0.05), 0.025);
    trainLoss.push(+tl.toFixed(4));
    valLoss.push(+vl.toFixed(4));
  }
  return { trainLoss, valLoss, epochs: Array.from({ length: epochs }, (_, i) => i + 1) };
}

// ── Ticker tape data ─────────────────────────────────────────
function getTickerTapeData() {
  return Object.entries(STOCKS).map(([sym, info]) => {
    const rng = seededRng(sym.charCodeAt(0) * 999);
    const change = +((rng() - 0.47) * 4).toFixed(2);
    const price  = +(info.base * (1 + (rng() - 0.5) * 0.1)).toFixed(2);
    return { sym, price, change };
  });
}

// ── Filter by range ──────────────────────────────────────────
function filterByRange(data, range) {
  const now = new Date();
  const cutoffs = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 9999 };
  const days = cutoffs[range] || 90;
  const cutoff = new Date(now.setDate(now.getDate() - days)).toISOString().slice(0, 10);
  return data.filter(d => d.date >= cutoff);
}
