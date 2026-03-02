/* ============================================================
   app.js – StockAI Pro v4 – Main Controller
   New features: Portfolio Tracker, AI News, advanced signals
   ============================================================ */

const state = {
  ticker:    null,
  ohlcv:     [],
  preds:     null,
  model:     'lstm',
  range:     '3M',
  watchlist: (() => { try { return JSON.parse(localStorage.getItem('wl') || '[]'); } catch(e) { return []; } })(),
  portfolio: (() => { try { return JSON.parse(localStorage.getItem('portfolio') || '[]'); } catch(e) { return []; } })(),
  theme:     (() => { try { return localStorage.getItem('theme') || 'dark'; } catch(e) { return 'dark'; } })(),
};

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(state.theme);
  initSidebar();
  initNavigation();
  initSearch();
  initRangeBtns();
  initModelSelect();
  initRefresh();
  initWatchlistBtn();
  initClearWatchlist();
  initTabs();
  initCompare();
  initForecast();
  initScreener();
  initNews();
  initPortfolio();
  initTooltips();
  initMarketStatus();
  buildTickerTape();
  renderWatchlistPanel();
  renderLossCurve('lossCurveChart');
  renderSectorChart();
  initConfFilter();
});

// ── Theme ─────────────────────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  document.body.className = theme;
  $('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem('theme', theme); } catch(e) {}
}
$('themeToggle').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  if (state.ticker) setTimeout(refreshAllCharts, 50);
  setTimeout(() => { renderLossCurve('lossCurveChart'); renderSectorChart(); }, 60);
});

// ── Sidebar ───────────────────────────────────────────────────
function initSidebar() {
  $('sidebarToggle').addEventListener('click', () => $('sidebar').classList.toggle('collapsed'));
  $('hamburger').addEventListener('click', () => $('sidebar').classList.toggle('mobile-open'));
  document.addEventListener('click', e => {
    const sb = $('sidebar');
    if (!sb.contains(e.target) && !$('hamburger').contains(e.target))
      sb.classList.remove('mobile-open');
  });
}

// ── Navigation ────────────────────────────────────────────────
function initNavigation() {
  $$('.nav-item').forEach(item => item.addEventListener('click', () => navigateTo(item.dataset.page)));
}

function navigateTo(page) {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  $$('.page').forEach(p => p.classList.remove('active'));
  const nav = document.querySelector(`[data-page="${page}"]`);
  const pg  = $(`page-${page}`);
  if (nav) nav.classList.add('active');
  if (pg)  pg.classList.add('active');
  const titles = {
    home: 'Dashboard', analytics: 'Analytics', forecast: 'AI Forecast',
    compare: 'Model Compare', screener: 'Screener',
    news: 'AI News', portfolio: 'Portfolio', about: 'About'
  };
  $('pageTitle').textContent = titles[page] || 'Dashboard';
  if (page === 'analytics' && state.ticker) renderAnalyticsPage();
  if (page === 'news') renderNewsPage();
  if (page === 'portfolio') renderPortfolioPage();
  $('sidebar').classList.remove('mobile-open');
}

// ── Search ────────────────────────────────────────────────────
function initSearch() {
  const input = $('searchInput');
  const sugg  = $('searchSuggestions');
  const btn   = $('searchBtn');

  input.addEventListener('input', () => {
    const val = input.value.trim().toUpperCase();
    if (!val) { sugg.classList.remove('show'); return; }
    const matches = Object.entries(STOCKS).filter(
      ([sym, info]) => sym.includes(val) || info.name.toUpperCase().includes(val)
    ).slice(0, 7);
    if (!matches.length) { sugg.classList.remove('show'); return; }
    sugg.innerHTML = matches.map(([sym, info]) =>
      `<div class="suggestion-item" data-sym="${sym}">
        <div style="display:flex;flex-direction:column;gap:1px">
          <span class="suggestion-ticker">${sym}</span>
          <span class="suggestion-name">${info.name}</span>
        </div>
        <span class="suggestion-sector">${info.sector}</span>
      </div>`
    ).join('');
    sugg.classList.add('show');
    sugg.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        loadStock(el.dataset.sym);
        input.value = el.dataset.sym;
        sugg.classList.remove('show');
      });
    });
  });

  btn.addEventListener('click', () => {
    const val = input.value.trim().toUpperCase();
    if (STOCKS[val]) { loadStock(val); sugg.classList.remove('show'); }
    else if (val) showToast(`"${val}" not found. Try: AAPL, TSLA, NVDA`, 'error');
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') btn.click();
    if (e.key === 'Escape') sugg.classList.remove('show');
  });
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !sugg.contains(e.target)) sugg.classList.remove('show');
  });
  $$('.quick-chip').forEach(c => c.addEventListener('click', () => loadStock(c.dataset.ticker)));
}

// ── Load Stock ────────────────────────────────────────────────
async function loadStock(ticker) {
  if (!STOCKS[ticker]) { showToast(`Unknown ticker: ${ticker}`, 'error'); return; }
  state.ticker = ticker;
  showLoading(true);
  await sleep(500);
  state.ohlcv = generateOHLCV(ticker, 400);
  state.preds = generatePredictions(state.ohlcv, state.model);
  showLoading(false);
  updateStatsCards();
  refreshAllCharts();
  updateChartTitle();
  updateSignalPanel();
  updateMiniPanels();
  showToast(`${ticker} loaded · ${state.model.toUpperCase()} model active`, 'success');
}

function showLoading(on) {
  $('mainChartLoading').style.display = on ? 'block' : 'none';
  $('mainChartWrap').style.display    = on ? 'none'  : 'block';
  $('mainEmptyState').style.display   = 'none';
}

function refreshAllCharts() {
  if (!state.ohlcv.length) return;
  renderMainChart('mainChart', state.ohlcv, state.preds, state.range);
  renderRSI('rsiChart', state.ohlcv, state.range);
  renderMACD('macdChart', state.ohlcv, state.range);
  renderBollinger('bollingerChart', state.ohlcv, state.range);
  renderVolume('volumeChart', state.ohlcv, state.range);
  updateRSISignal();
  updateMACDSignal();
  updateVolBadge();
}

function updateChartTitle() {
  const info = STOCKS[state.ticker] || {};
  $('chartTitle').textContent = `${state.ticker} · ${info.name || ''}`;
  const ts = `Updated: ${new Date().toLocaleTimeString()}`;
  $('lastUpdated').textContent = ts;
  $('analyticsTitle').textContent = `${state.ticker} — Deep Analytics`;
  $('analyticsUpdated').textContent = ts;
}

// ── Mini Panels ───────────────────────────────────────────────
function updateMiniPanels() {
  if (!state.ohlcv.length) return;
  $('miniPanelsRow').style.display = 'grid';
  const closes = state.ohlcv.map(d => d.close);
  const hi52 = Math.max(...closes.slice(-252));
  const lo52 = Math.min(...closes.slice(-252));
  const avgVol = (state.ohlcv.slice(-30).reduce((s, d) => s + d.volume, 0) / 30 / 1e6).toFixed(2);
  const sma20arr = calcSMA(closes, 20);
  const lastSMA = sma20arr[sma20arr.length - 1];
  const lastPrice = closes[closes.length - 1];
  const smaRatio = lastSMA ? (lastPrice / lastSMA * 100).toFixed(1) + '%' : '--';

  $('mp52High').textContent = `$${hi52.toFixed(2)}`;
  $('mp52Low').textContent  = `$${lo52.toFixed(2)}`;
  $('mpAvgVol').textContent = `${avgVol}M`;
  $('mpSmaRatio').textContent = smaRatio;
  const el = $('mpSmaRatio');
  el.style.color = lastSMA && lastPrice > lastSMA ? 'var(--green)' : 'var(--red)';
}

// ── Signal Panel ──────────────────────────────────────────────
function updateSignalPanel() {
  if (!state.ohlcv.length || !state.preds) return;
  $('signalPanel').style.display = 'block';
  const closes = state.ohlcv.map(d => d.close);
  const rsiArr  = calcRSI(closes);
  const lastRSI = rsiArr[rsiArr.length - 1];
  const { macdLine, signalLine } = calcMACD(closes);
  const macdCross  = macdLine[macdLine.length-1] > signalLine[signalLine.length-1] ? 'BUY' : 'SELL';
  const rsiSig     = lastRSI > 70 ? 'SELL' : lastRSI < 30 ? 'BUY' : 'NEUTRAL';
  const pred       = state.preds;
  const aiSig      = pred.nextDay > closes[closes.length - 1] ? 'BUY' : 'SELL';
  const bb         = calcBollingerBands(closes, 20);
  const lastBB     = bb[bb.length - 1];
  const lastClose  = closes[closes.length - 1];
  const bbSig      = lastBB.upper && lastClose > lastBB.upper ? 'SELL' : lastBB.lower && lastClose < lastBB.lower ? 'BUY' : 'NEUTRAL';

  const votes  = [macdCross, rsiSig, aiSig, bbSig].filter(s => s === 'BUY').length;
  const sellV  = [macdCross, rsiSig, aiSig, bbSig].filter(s => s === 'SELL').length;
  const overall = votes >= 3 ? 'BUY' : sellV >= 3 ? 'SELL' : votes > sellV ? 'BUY' : votes < sellV ? 'SELL' : 'HOLD';

  const sigMap = { 'BUY':'buy','SELL':'sell','HOLD':'hold','NEUTRAL':'neutral' };

  $('signalRow').innerHTML = `
    <div class="signal-badge ${sigMap[overall]}">📊 Overall: ${overall}</div>
    <div class="signal-badge ${sigMap[aiSig]}">🤖 AI: ${aiSig}</div>
    <div class="signal-badge ${sigMap[macdCross]}">📈 MACD: ${macdCross}</div>
    <div class="signal-badge ${sigMap[rsiSig]}">📉 RSI: ${rsiSig} (${lastRSI?.toFixed(1)})</div>
    <div class="signal-badge ${sigMap[bbSig]}">〽️ BB: ${bbSig}</div>
    <div class="signal-badge neutral">⚡ Conf: ${pred.confidence}%</div>
  `;

  $('signalTime').textContent = `Signals as of ${new Date().toLocaleTimeString()}`;

  const alertEl = $('statAlert');
  alertEl.style.display = 'inline';
  alertEl.textContent = overall;
  alertEl.className = `stat-alert ${sigMap[overall]}`;

  const last = closes[closes.length - 1];
  const rng  = seededRng(state.ticker.charCodeAt(0) * 777);
  const days = ['Tomorrow', 'Day 2', 'Day 3', 'Day 4'];
  let fp = last;
  $('forecastRow').innerHTML = days.map(d => {
    fp = fp * (1 + (rng() - 0.47) * 0.022);
    const chg = ((fp - last) / last * 100).toFixed(2);
    const up = fp >= last;
    return `<div class="forecast-card">
      <div class="forecast-day">${d}</div>
      <div class="forecast-price" style="color:${up?'var(--green)':'var(--red)'}">$${fp.toFixed(2)}</div>
      <div class="forecast-change ${up?'up':'dn'}">${up?'▲':'▼'} ${Math.abs(chg)}%</div>
    </div>`;
  }).join('');
}

function updateMACDSignal() {
  if (!state.ohlcv.length) return;
  const closes = state.ohlcv.map(d => d.close);
  const { macdLine, signalLine } = calcMACD(closes);
  const cross = macdLine[macdLine.length-1] > signalLine[signalLine.length-1];
  const el = $('macdSignalBadge');
  el.textContent = cross ? '▲ Bullish Crossover' : '▼ Bearish Crossover';
  el.style.color = cross ? 'var(--green)' : 'var(--red)';
}

function updateVolBadge() {
  if (!state.ohlcv.length) return;
  const last5 = state.ohlcv.slice(-5);
  const avg30 = state.ohlcv.slice(-30).reduce((s,d)=>s+d.volume,0)/30;
  const lastVol = last5[last5.length-1].volume;
  const el = $('volBadge');
  const ratio = (lastVol / avg30 * 100).toFixed(0);
  el.textContent = `Latest: ${(lastVol/1e6).toFixed(1)}M  (${ratio}% of avg)`;
  el.style.color = lastVol > avg30 * 1.5 ? 'var(--gold)' : 'var(--text-muted)';
}

// ── Stats Cards ───────────────────────────────────────────────
function updateStatsCards() {
  if (!state.preds || !state.ohlcv.length) return;
  const last = state.ohlcv[state.ohlcv.length - 1];
  const prev = state.ohlcv[state.ohlcv.length - 2];
  const chg  = last.close - prev.close;
  const chgP = (chg / prev.close * 100).toFixed(2);
  const sign = chg >= 0 ? '+' : '';

  $('statPrice').textContent = `$${last.close.toFixed(2)}`;
  const chgEl = $('statChange');
  chgEl.textContent = `${sign}$${chg.toFixed(2)} (${sign}${chgP}%)`;
  chgEl.className = 'stat-change ' + (chg >= 0 ? 'pos' : 'neg');

  const predChg  = state.preds.nextDay - last.close;
  const predSign = predChg >= 0 ? '+' : '';
  $('statPred').textContent = `$${state.preds.nextDay.toFixed(2)}`;
  const predChgEl = $('statPredChange');
  predChgEl.textContent = `${predSign}$${predChg.toFixed(2)} (${predSign}${(predChg/last.close*100).toFixed(2)}%)`;
  predChgEl.className = 'stat-change ' + (predChg >= 0 ? 'pos' : 'neg');

  $('statRmse').textContent = state.preds.rmse;
  $('statMae').textContent  = state.preds.mae;
  $('statConf').textContent = `${state.preds.confidence}%`;
  $('confFill').style.width = `${state.preds.confidence}%`;

  const closes = state.ohlcv.map(d => d.close);
  $('aRmse').textContent  = state.preds.rmse;
  $('aMae').textContent   = state.preds.mae;
  $('aMape').textContent  = `${state.preds.mape}%`;
  $('aR2').textContent    = state.preds.r2;
  $('aConf').textContent  = `${state.preds.confidence}%`;

  const hi52  = Math.max(...closes.slice(-252));
  const lo52  = Math.min(...closes.slice(-252));
  const avgVol = (state.ohlcv.slice(-30).reduce((s,d)=>s+d.volume,0)/30/1e6).toFixed(1);
  $('a52High').textContent = `$${hi52.toFixed(2)}`;
  $('a52Low').textContent  = `$${lo52.toFixed(2)}`;
  $('aAvgVol').textContent = `${avgVol}M`;

  const recent = closes.slice(-5);
  const trend  = recent[4] > recent[0] ? '↑ Bullish' : '↓ Bearish';
  const trendEl = $('aTrend');
  trendEl.textContent = trend;
  trendEl.style.color = recent[4] > recent[0] ? 'var(--green)' : 'var(--red)';

  const rsi = calcRSI(closes);
  const lastRSI = rsi[rsi.length-1];
  const sig = lastRSI > 70 ? 'Overbought' : lastRSI < 30 ? 'Oversold' : 'Neutral';
  const sigEl = $('aSignal');
  sigEl.textContent = sig;
  sigEl.style.color = lastRSI>70?'var(--red)':lastRSI<30?'var(--green)':'var(--blue)';
}

function updateRSISignal() {
  if (!state.ohlcv.length) return;
  const rsi  = calcRSI(state.ohlcv.map(d=>d.close));
  const last = rsi[rsi.length - 1];
  const el   = $('rsiSignal');
  if (last > 70)      { el.textContent = `Overbought (${last?.toFixed(1)})`; el.className = 'rsi-signal overbought'; }
  else if (last < 30) { el.textContent = `Oversold (${last?.toFixed(1)})`;   el.className = 'rsi-signal oversold'; }
  else                { el.textContent = `Neutral (${last?.toFixed(1)})`;    el.className = 'rsi-signal neutral'; }
}

// ── Range Buttons ─────────────────────────────────────────────
function initRangeBtns() {
  $$('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.range-btns').querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.range = btn.dataset.range;
      if (state.ticker) refreshAllCharts();
    });
  });
}

// ── Model Select ──────────────────────────────────────────────
function initModelSelect() {
  $('modelSelect').addEventListener('change', async e => {
    state.model = e.target.value;
    if (!state.ticker) return;
    showLoading(true);
    await sleep(350);
    state.preds = generatePredictions(state.ohlcv, state.model);
    showLoading(false);
    updateStatsCards();
    refreshAllCharts();
    updateSignalPanel();
    showToast(`Switched to ${state.model.toUpperCase()} model`, 'info');
  });
}

// ── Refresh ───────────────────────────────────────────────────
function initRefresh() {
  $('refreshBtn').addEventListener('click', async () => {
    if (!state.ticker) return;
    showToast('Refreshing data…', 'info');
    await sleep(400);
    loadStock(state.ticker);
  });
}

// ── Watchlist ─────────────────────────────────────────────────
function initWatchlistBtn() {
  $('watchlistBtn').addEventListener('click', () => {
    if (!state.ticker) return;
    if (state.watchlist.includes(state.ticker)) {
      showToast(`${state.ticker} already in watchlist`, 'info'); return;
    }
    state.watchlist.push(state.ticker);
    try { localStorage.setItem('wl', JSON.stringify(state.watchlist)); } catch(e) {}
    renderWatchlistPanel();
    showToast(`⭐ ${state.ticker} added to watchlist`, 'success');
  });
}

function initClearWatchlist() {
  $('clearWatchlist').addEventListener('click', () => {
    state.watchlist = [];
    try { localStorage.setItem('wl', '[]'); } catch(e) {}
    renderWatchlistPanel();
    showToast('Watchlist cleared', 'info');
  });
}

function renderWatchlistPanel() {
  const c = $('watchlistContainer');
  if (!state.watchlist.length) {
    c.innerHTML = `<div class="empty-state-small"><p>Add stocks with ⭐ above</p></div>`; return;
  }
  c.innerHTML = state.watchlist.map(sym => {
    const info = STOCKS[sym] || { name: sym, base: 100 };
    const rng  = seededRng(sym.charCodeAt(0) * 12345);
    const chg  = +((rng()-0.47)*3.5).toFixed(2);
    const price = +(info.base*(1+(rng()-0.5)*0.08)).toFixed(2);
    const sign  = chg>=0?'+':'';
    return `<div class="watchlist-item" data-sym="${sym}">
      <div class="wl-left">
        <span class="wl-symbol">${sym}</span>
        <span class="wl-name">${info.name}</span>
      </div>
      <div class="wl-right">
        <span class="wl-price">$${price}</span>
        <span class="${chg>=0?'wl-change-pos':'wl-change-neg'}">${sign}${chg}%</span>
        <span class="wl-remove" data-sym="${sym}">✕</span>
      </div>
    </div>`;
  }).join('');

  c.querySelectorAll('.watchlist-item').forEach(el => {
    el.addEventListener('click', e => {
      if (!e.target.classList.contains('wl-remove')) {
        loadStock(el.dataset.sym);
        $('searchInput').value = el.dataset.sym;
        navigateTo('home');
      }
    });
  });
  c.querySelectorAll('.wl-remove').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      state.watchlist = state.watchlist.filter(s => s !== el.dataset.sym);
      try { localStorage.setItem('wl', JSON.stringify(state.watchlist)); } catch(e) {}
      renderWatchlistPanel();
    });
  });
}

// ── Analytics Page ────────────────────────────────────────────
function renderAnalyticsPage() {
  if (!state.ohlcv.length) return;
  renderMainChart('analyticsChart', state.ohlcv, state.preds, state.range);
  renderRSI('analyticsRsi', state.ohlcv, state.range);
  renderMACD('analyticsMacd', state.ohlcv, state.range);
  renderBollinger('analyticsBB', state.ohlcv, state.range);
  renderVolume('analyticsVol', state.ohlcv, state.range);
  renderLossCurve('lossCurveChart');
  renderHeatmap();
}

function renderHeatmap() {
  if (!state.ohlcv.length) return;
  const recent = state.ohlcv.slice(-84);
  const grid = $('heatmapGrid');
  grid.innerHTML = recent.map((d, i) => {
    const ret = i===0 ? 0 : ((d.close-recent[i-1].close)/recent[i-1].close*100);
    const clamp = Math.max(-3, Math.min(3, ret));
    const intensity = Math.abs(clamp)/3;
    const color = clamp >= 0
      ? `rgba(34,197,94,${0.15 + intensity * 0.72})`
      : `rgba(244,63,94,${0.15 + intensity * 0.72})`;
    return `<div class="heatmap-cell" style="background:${color}" title="${d.date}: ${ret.toFixed(2)}%"></div>`;
  }).join('');
}

// ── Tabs ──────────────────────────────────────────────────────
function initTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.indicators-tabs');
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
    });
  });
}

// ── Model Compare ─────────────────────────────────────────────
function initCompare() {
  $('compareBtn').addEventListener('click', async () => {
    const val = $('compareSearch').value.trim().toUpperCase() || state.ticker;
    if (!val || !STOCKS[val]) { showToast('Enter a valid ticker first', 'error'); return; }
    showToast(`Running 3-model comparison for ${val}…`, 'info');
    await sleep(700);

    const data = generateOHLCV(val, 400);
    renderCompareChart('lstmChart',        data, 'lstm',        CHART_COLORS.lstm);
    renderCompareChart('transformerChart', data, 'transformer', CHART_COLORS.transformer);
    renderCompareChart('gruChart',         data, 'gru',         CHART_COLORS.gru);

    const models  = ['lstm', 'transformer', 'gru'];
    const metrics = models.map(m => generatePredictions(data, m));

    const rows = [
      { label: 'RMSE',       vals: metrics.map(m=>m.rmse),                     lower: true  },
      { label: 'MAE',        vals: metrics.map(m=>m.mae),                      lower: true  },
      { label: 'MAPE',       vals: metrics.map(m=>m.mape), fmt: v=>v+'%',      lower: true  },
      { label: 'R²',         vals: metrics.map(m=>m.r2),                       lower: false },
      { label: 'Confidence', vals: metrics.map(m=>m.confidence), fmt: v=>v+'%',lower: false },
    ];

    const $body = $('compareTableBody');
    $body.innerHTML = rows.map(row => {
      const nums = row.vals.map(parseFloat);
      const best = row.lower ? Math.min(...nums) : Math.max(...nums);
      const bestIdx = nums.indexOf(best);
      const modelNames = ['LSTM','Transformer','GRU'];
      const cells = row.vals.map((v,i) =>
        `<td class="${i===bestIdx?'best':''}">${row.fmt?row.fmt(v):v}</td>`
      ).join('');
      return `<tr><td>${row.label}</td>${cells}<td style="color:var(--gold);font-weight:800">${modelNames[bestIdx]}</td></tr>`;
    }).join('');

    showToast(`Comparison complete for ${val}`, 'success');
  });
}

// ── AI Forecast Page ──────────────────────────────────────────
function initForecast() {
  $('forecastBtn').addEventListener('click', async () => {
    const val = $('forecastSearch').value.trim().toUpperCase() || state.ticker;
    if (!val || !STOCKS[val]) { showToast('Enter a valid ticker first', 'error'); return; }
    showToast(`Generating 30-day forecast for ${val}…`, 'info');
    await sleep(800);

    const data  = generateOHLCV(val, 400);
    const preds = generatePredictions(data, state.model);
    const last  = data[data.length-1].close;
    const rng   = seededRng(val.charCodeAt(0) * 4321);

    const projDays = 30;
    const proj=[], bull=[], bear=[];
    let fp = last;
    for (let i=0; i<projDays; i++) {
      fp = fp*(1+(rng()-0.47)*0.022);
      proj.push(+fp.toFixed(2));
      bull.push(+(fp*(1+rng()*0.016)).toFixed(2));
      bear.push(+(fp*(1-rng()*0.019)).toFixed(2));
    }

    renderForecastChart('forecastChart', data.slice(-60), proj, bull, bear);

    const finalBull=bull[bull.length-1], finalBase=proj[proj.length-1], finalBear=bear[bear.length-1];
    $('fBull').textContent    = `$${finalBull.toFixed(2)}`;
    $('fBase').textContent    = `$${finalBase.toFixed(2)}`;
    $('fBear').textContent    = `$${finalBear.toFixed(2)}`;
    $('fUpside').textContent  = `+${((finalBull-last)/last*100).toFixed(1)}%`;
    $('fDownside').textContent= `${((finalBear-last)/last*100).toFixed(1)}%`;
    const vol=(proj.map((p,i)=>i===0?0:Math.abs((p-proj[i-1])/proj[i-1]*100)).slice(1).reduce((a,b)=>a+b)/(proj.length-1)).toFixed(2);
    $('fVol').textContent     = `${vol}% avg/day`;
    $('fModel').textContent   = state.model.toUpperCase();
    $('forecastChartTitle').textContent = `${val} — 30-Day AI Forecast`;

    const snapIdx = [4,9,14,19,24,29];
    const labels  = ['Day 5','Day 10','Day 15','Day 20','Day 25','Day 30'];
    $('forecastCards').innerHTML = labels.map((lbl,i) => {
      const p=proj[snapIdx[i]], up=p>=last, chg=((p-last)/last*100).toFixed(1);
      return `<div class="forecast-card">
        <div class="forecast-day">${lbl}</div>
        <div class="forecast-price" style="color:${up?'var(--green)':'var(--red)'}">$${p.toFixed(2)}</div>
        <div class="forecast-change ${up?'up':'dn'}">${up?'▲':'▼'} ${Math.abs(chg)}%</div>
      </div>`;
    }).join('');

    renderProbChart('probChart', last, finalBull, finalBase, finalBear);
    showToast(`30-day forecast ready for ${val}`, 'success');
  });
}

// ── Screener ──────────────────────────────────────────────────
function initScreener() {
  $('screenBtn').addEventListener('click', runScreener);
  $('screenBtn2').addEventListener('click', runScreener);
  $('confFilter').addEventListener('input', () => {
    $('confFilterVal').textContent = `${$('confFilter').value}%+`;
  });
}
function initConfFilter() {
  $('confFilterVal').textContent = `${$('confFilter').value}%+`;
}

async function runScreener() {
  showToast('Scanning all stocks…', 'info');
  await sleep(550);

  const sector  = $('sectorFilter').value;
  const sigF    = $('signalFilter').value;
  const minConf = parseInt($('confFilter').value);
  const sortBy  = $('sortFilter').value;

  let results = Object.entries(STOCKS).map(([sym, info]) => {
    const data   = generateOHLCV(sym, 200);
    const preds  = generatePredictions(data, state.model);
    const last   = data[data.length-1];
    const prev   = data[data.length-2];
    const chg    = ((last.close-prev.close)/prev.close*100).toFixed(2);
    const closes = data.map(d=>d.close);
    const rsi    = calcRSI(closes);
    const lastRSI= rsi[rsi.length-1];
    const rsiSig = lastRSI>70?'SELL':lastRSI<30?'BUY':'HOLD';
    const aiSig  = preds.nextDay>last.close?'BUY':'SELL';
    const votes  = [rsiSig,aiSig].filter(s=>s==='BUY').length;
    const signal = votes>=2?'BUY':votes===1?'HOLD':'SELL';
    return { sym, info, price:last.close, chg:parseFloat(chg), signal, conf:preds.confidence, rmse:preds.rmse };
  }).filter(r => {
    if (sector && r.info.sector!==sector) return false;
    if (sigF && r.signal!==sigF) return false;
    if (r.conf < minConf) return false;
    return true;
  });

  if (sortBy==='change') results.sort((a,b)=>b.chg-a.chg);
  else if (sortBy==='price') results.sort((a,b)=>b.price-a.price);
  else if (sortBy==='rmse') results.sort((a,b)=>parseFloat(a.rmse)-parseFloat(b.rmse));
  else results.sort((a,b)=>b.conf-a.conf);

  $('screenerCount').textContent = `${results.length} stock${results.length!==1?'s':''}`;

  const sigMap = { 'BUY':'buy','SELL':'sell','HOLD':'hold' };
  $('screenerBody').innerHTML = results.length ? results.map(r =>
    `<tr onclick="loadStock('${r.sym}');$('searchInput').value='${r.sym}';navigateTo('home')">
      <td style="font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--gold)">${r.sym}</td>
      <td style="color:var(--text-primary);font-size:0.82rem">${r.info.name}</td>
      <td style="color:var(--text-muted);font-size:0.77rem">${r.info.sector}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:600">$${r.price.toFixed(2)}</td>
      <td style="color:${r.chg>=0?'var(--green)':'var(--red)'};font-weight:700;font-family:'JetBrains Mono',monospace">${r.chg>=0?'+':''}${r.chg}%</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700">${r.conf}%</td>
      <td><span class="signal-pill ${sigMap[r.signal]}">${r.signal}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;color:var(--text-secondary)">${r.rmse}</td>
    </tr>`
  ).join('') : `<tr><td colspan="8" class="table-empty">No stocks match these filters</td></tr>`;

  showToast(`Found ${results.length} stocks matching criteria`, 'success');
}

// ── AI NEWS PAGE ──────────────────────────────────────────────
const NEWS_HEADLINES = [
  { ticker:'NVDA', headline:'NVIDIA reports record datacenter revenue driven by AI chip demand', sentiment:'pos', source:'Reuters', mins:3 },
  { ticker:'AAPL', headline:'Apple faces regulatory scrutiny over App Store policies in Europe', sentiment:'neg', source:'Bloomberg', mins:12 },
  { ticker:'TSLA', headline:'Tesla Cybertruck deliveries exceed Q4 analyst estimates by 18%', sentiment:'pos', source:'CNBC', mins:25 },
  { ticker:'MSFT', headline:'Microsoft Azure AI revenue grows 29% YoY as enterprise adoption accelerates', sentiment:'pos', source:'WSJ', mins:41 },
  { ticker:'GOOGL', headline:'Alphabet quietly launches Gemini Ultra 2 for enterprise customers', sentiment:'pos', source:'TechCrunch', mins:58 },
  { ticker:'META', headline:'Meta Platforms faces advertiser concerns over AI-generated content moderation', sentiment:'neg', source:'FT', mins:74 },
  { ticker:'AMZN', headline:'Amazon AWS captures 32% of cloud market share in latest industry report', sentiment:'pos', source:'Seeking Alpha', mins:89 },
  { ticker:'JPM', headline:'JPMorgan raises dividend by 10% as net interest income beats expectations', sentiment:'pos', source:'Reuters', mins:102 },
  { ticker:'INTC', headline:'Intel delays next-gen 18A process node citing yield challenges', sentiment:'neg', source:'AnandTech', mins:115 },
  { ticker:'NFLX', headline:'Netflix adds 9.3M subscribers in Q4, ad-supported tier reaches 23M users', sentiment:'pos', source:'Variety', mins:130 },
  { ticker:'AMD', headline:'AMD MI300X AI accelerators see supply constraints amid overwhelming demand', sentiment:'pos', source:'The Verge', mins:144 },
  { ticker:'DIS', headline:'Disney+ streaming losses narrow as Bob Iger cost-cutting initiative shows results', sentiment:'pos', source:'Deadline', mins:158 },
  { ticker:'TSLA', headline:'Tesla Shanghai plant production cut amid softening EV demand in China', sentiment:'neg', source:'South China Morning Post', mins:170 },
  { ticker:'NVDA', headline:'NVIDIA H200 GPU waitlist now extends to Q3 2025 amid AI infrastructure boom', sentiment:'pos', source:'Data Center Dynamics', mins:185 },
  { ticker:'V',    headline:'Visa cross-border transaction volume recovers to pre-pandemic levels globally', sentiment:'pos', source:'PaymentsSource', mins:200 },
];

function initNews() {
  $('refreshNewsBtn').addEventListener('click', renderNewsPage);
}

function renderNewsPage() {
  $('newsFeedTime').textContent = `Updated: ${new Date().toLocaleTimeString()}`;

  const tickerFilter = $('newsTickerInput')?.value.trim().toUpperCase() || '';
  let items = tickerFilter ? NEWS_HEADLINES.filter(n=>n.ticker===tickerFilter) : NEWS_HEADLINES;

  const bull = items.filter(n=>n.sentiment==='pos').length;
  const bear = items.filter(n=>n.sentiment==='neg').length;
  const mood = bull > bear ? '🟢 Bullish' : bull < bear ? '🔴 Bearish' : '🟡 Neutral';

  $('newsBull').textContent  = bull;
  $('newsBear').textContent  = bear;
  $('newsMood').textContent  = mood;

  $('newsList').innerHTML = items.map(n => {
    const smap = { pos:'Bullish', neg:'Bearish', neu:'Neutral' };
    const t = n.mins < 60 ? `${n.mins}m ago` : `${Math.floor(n.mins/60)}h ago`;
    return `<div class="news-item" onclick="loadStock('${n.ticker}');navigateTo('home')">
      <div class="news-dot ${n.sentiment}"></div>
      <div class="news-content">
        <div class="news-headline">${n.headline}</div>
        <div class="news-meta">
          <span class="news-source">${n.source}</span>
          <span class="news-time">${t}</span>
          <span style="font-weight:800;font-size:0.68rem;color:var(--gold)">${n.ticker}</span>
          <span class="news-badge ${n.sentiment}">${smap[n.sentiment]}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Sentiment Chart
  renderSentimentChart();

  // Trending Tickers
  const freq = {};
  items.forEach(n => { freq[n.ticker] = (freq[n.ticker]||{count:0,pos:0}); freq[n.ticker].count++; if(n.sentiment==='pos') freq[n.ticker].pos++; });
  const sorted = Object.entries(freq).sort((a,b)=>b[1].count-a[1].count).slice(0,6);
  $('trendingList').innerHTML = sorted.map(([sym,d]) => {
    const info = STOCKS[sym]||{name:sym};
    const ratio = (d.pos/d.count*100).toFixed(0);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;transition:all var(--t)"
      onclick="loadStock('${sym}');navigateTo('home')"
      onmouseover="this.style.borderColor='var(--border-gold)'" onmouseout="this.style.borderColor='var(--border)'">
      <div>
        <div style="font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--gold);font-size:0.88rem">${sym}</div>
        <div style="font-size:0.69rem;color:var(--text-muted)">${d.count} article${d.count>1?'s':''}</div>
      </div>
      <span style="font-size:0.73rem;font-weight:700;color:${ratio>=50?'var(--green)':'var(--red)'}">${ratio}% Bull</span>
    </div>`;
  }).join('');

  showToast('News feed refreshed', 'success');
}

// ── PORTFOLIO PAGE ────────────────────────────────────────────
function initPortfolio() {
  $('addPositionBtn').addEventListener('click', () => {
    const form = $('addPositionForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  $('savePositionBtn').addEventListener('click', savePosition);
  $('clearPortfolioBtn').addEventListener('click', () => {
    state.portfolio = [];
    try { localStorage.setItem('portfolio', '[]'); } catch(e) {}
    renderPortfolioPage();
    showToast('Portfolio cleared', 'info');
  });
}

function savePosition() {
  const ticker   = $('posTicker').value.trim().toUpperCase();
  const shares   = parseFloat($('posShares').value);
  const buyPrice = parseFloat($('posBuyPrice').value);

  if (!STOCKS[ticker]) { showToast(`Unknown ticker: ${ticker}`, 'error'); return; }
  if (!shares || !buyPrice || shares <= 0 || buyPrice <= 0) { showToast('Enter valid shares and price', 'error'); return; }

  const existing = state.portfolio.findIndex(p => p.ticker === ticker);
  if (existing >= 0) {
    state.portfolio[existing].shares   += shares;
    state.portfolio[existing].buyPrice  = (state.portfolio[existing].buyPrice + buyPrice) / 2;
  } else {
    state.portfolio.push({ ticker, shares, buyPrice });
  }
  try { localStorage.setItem('portfolio', JSON.stringify(state.portfolio)); } catch(e) {}
  $('addPositionForm').style.display = 'none';
  $('posTicker').value = ''; $('posShares').value = ''; $('posBuyPrice').value = '';
  renderPortfolioPage();
  showToast(`${ticker} added to portfolio`, 'success');
}

function renderPortfolioPage() {
  if (!state.portfolio.length) {
    $('portfolioBody').innerHTML = '<tr><td colspan="8" class="table-empty">Add positions to track your portfolio</td></tr>';
    $('portTotalVal').textContent = '$0.00';
    $('portPnL').textContent = '$0.00';
    $('portAiVal').textContent = '$0.00';
    $('portCount').textContent = '0';
    renderAllocationChart([]);
    return;
  }

  let totalVal=0, totalCost=0, totalAiVal=0;
  const rows = state.portfolio.map(pos => {
    const data   = generateOHLCV(pos.ticker, 10);
    const preds  = generatePredictions(data, state.model);
    const curr   = data[data.length-1].close;
    const val    = curr * pos.shares;
    const cost   = pos.buyPrice * pos.shares;
    const pnl    = val - cost;
    const pnlPct = (pnl/cost*100).toFixed(2);
    const aiNext = preds.nextDay * pos.shares;
    const closes = data.map(d=>d.close);
    const rsi    = calcRSI(closes);
    const lastRSI= rsi[rsi.length-1];
    const signal = lastRSI>70?'SELL':lastRSI<30?'BUY':'HOLD';
    totalVal += val; totalCost += cost; totalAiVal += aiNext;
    return { ...pos, curr, val, pnl, pnlPct, signal };
  });

  $('portTotalVal').textContent = `$${totalVal.toFixed(2)}`;
  $('portAiVal').textContent    = `$${totalAiVal.toFixed(2)}`;
  $('portCount').textContent    = state.portfolio.length;
  const totalPnL = totalVal - totalCost;
  const pnlEl   = $('portPnL');
  pnlEl.textContent = `${totalPnL>=0?'+':''}$${totalPnL.toFixed(2)}`;
  pnlEl.style.color = totalPnL>=0?'var(--green)':'var(--red)';
  const chgEl = $('portTotalChg');
  const totalChgPct = (totalPnL/totalCost*100).toFixed(2);
  chgEl.textContent = `${totalPnL>=0?'+':''}${totalChgPct}% total P&L`;
  chgEl.className = 'stat-change ' + (totalPnL>=0?'pos':'neg');

  const sigMap = { 'BUY':'buy','SELL':'sell','HOLD':'hold' };
  $('portfolioBody').innerHTML = rows.map(r => `
    <tr>
      <td style="font-weight:800;font-family:'JetBrains Mono',monospace;color:var(--gold)">${r.ticker}</td>
      <td style="font-family:'JetBrains Mono',monospace">${r.shares}</td>
      <td style="font-family:'JetBrains Mono',monospace">$${r.buyPrice.toFixed(2)}</td>
      <td style="font-family:'JetBrains Mono',monospace">$${r.curr.toFixed(2)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700">$${r.val.toFixed(2)}</td>
      <td style="color:${r.pnl>=0?'var(--green)':'var(--red)'};font-weight:700;font-family:'JetBrains Mono',monospace">${r.pnl>=0?'+':''}$${r.pnl.toFixed(2)} (${r.pnl>=0?'+':''}${r.pnlPct}%)</td>
      <td><span class="signal-pill ${sigMap[r.signal]}">${r.signal}</span></td>
      <td><button onclick="removePosition('${r.ticker}')" style="background:var(--red-soft);border:1px solid rgba(244,63,94,0.3);color:var(--red);padding:3px 9px;border-radius:5px;cursor:pointer;font-size:0.73rem;font-weight:700">Remove</button></td>
    </tr>`
  ).join('');

  renderAllocationChart(rows);
}

function removePosition(ticker) {
  state.portfolio = state.portfolio.filter(p => p.ticker !== ticker);
  try { localStorage.setItem('portfolio', JSON.stringify(state.portfolio)); } catch(e) {}
  renderPortfolioPage();
  showToast(`${ticker} removed from portfolio`, 'info');
}

// ── Ticker Tape ───────────────────────────────────────────────
function buildTickerTape() {
  const items = getTickerTapeData();
  const inner = $('tickerInner');
  const html  = items.map(({ sym, price, change }) => {
    const sign = change>=0?'+':'';
    const cls  = change>=0?'ticker-change-pos':'ticker-change-neg';
    return `<span class="ticker-item">
      <span class="ticker-symbol">${sym}</span>
      <span class="ticker-sep">·</span>
      <span class="ticker-price">$${price}</span>
      <span class="${cls}">${sign}${change}%</span>
    </span>`;
  }).join('');
  inner.innerHTML = html + html;
}

// ── Market Status ─────────────────────────────────────────────
function initMarketStatus() {
  function check() {
    const now = new Date();
    const day = now.getDay();
    const mins = now.getHours()*60 + now.getMinutes();
    const open = day>=1 && day<=5 && mins>=570 && mins<960;
    $('marketDot').className = 'status-dot' + (open?'':' closed');
    $('marketStatus').textContent = open ? 'Market Open' : 'Market Closed';
  }
  check(); setInterval(check, 60000);
}

// ── Tooltips ──────────────────────────────────────────────────
function initTooltips() {
  const popup = $('tooltipPopup');
  $$('.info-icon').forEach(icon => {
    icon.addEventListener('mouseenter', e => { popup.textContent = icon.dataset.tip||''; popup.classList.add('show'); posTooltip(e); });
    icon.addEventListener('mousemove', posTooltip);
    icon.addEventListener('mouseleave', () => popup.classList.remove('show'));
  });
  function posTooltip(e) { popup.style.left=(e.clientX+12)+'px'; popup.style.top=(e.clientY-8)+'px'; }
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type='info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 3400);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
