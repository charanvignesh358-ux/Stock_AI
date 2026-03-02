/* ============================================================
   charts.js – StockAI Pro v4 – Full Chart Engine
   ============================================================ */

const CHART_COLORS = {
  actual:      '#4f7cf5',
  prediction:  '#f5a623',
  confidence:  'rgba(245,166,35,0.08)',
  sma20:       '#22c55e',
  sma50:       '#a78bfa',
  bbUpper:     'rgba(34,211,238,0.55)',
  bbLower:     'rgba(34,211,238,0.55)',
  bbFill:      'rgba(34,211,238,0.06)',
  rsi:         '#22d3ee',
  rsiOB:       'rgba(244,63,94,0.14)',
  rsiOS:       'rgba(34,197,94,0.14)',
  macdLine:    '#4f7cf5',
  signalLine:  '#f5a623',
  histPos:     'rgba(34,197,94,0.65)',
  histNeg:     'rgba(244,63,94,0.65)',
  volume:      'rgba(79,124,245,0.45)',
  lstm:        '#4f7cf5',
  transformer: '#a78bfa',
  gru:         '#22c55e',
};

const isDark = () => document.body.classList.contains('dark');

function chartDefaults() {
  const dark = isDark();
  return {
    grid:         dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
    tick:         dark ? '#2e4060' : '#94a8cc',
    font:         "'Inter', sans-serif",
    mono:         "'JetBrains Mono', monospace",
    bg:           dark ? '#0b1528' : '#ffffff',
    tooltipBg:    dark ? '#0f1c32' : '#ffffff',
    tooltipTitle: dark ? '#dce8ff' : '#0e1830',
    tooltipBody:  dark ? '#5a72a0' : '#3d5080',
    tooltipBorder:dark ? 'rgba(79,130,245,0.15)' : 'rgba(0,0,0,0.08)',
  };
}

function destroyChart(id) {
  const c = Chart.getChart(id);
  if (c) c.destroy();
}

const baseTooltip = (def) => ({
  backgroundColor:  def.tooltipBg,
  titleColor:       def.tooltipTitle,
  bodyColor:        def.tooltipBody,
  borderColor:      def.tooltipBorder,
  borderWidth:      1,
  padding:          10,
  cornerRadius:     8,
  titleFont: { family: def.font, size: 12, weight: '700' },
  bodyFont:  { family: def.mono, size: 11 },
  displayColors: true,
  boxPadding: 4,
});

const baseScales = (def, yPrefix='', yCallback=null) => ({
  x: {
    ticks: { color: def.tick, font: { family: def.font, size: 10 }, maxTicksLimit: 8, maxRotation: 0 },
    grid:  { color: def.grid }
  },
  y: {
    ticks: {
      color: def.tick, font: { family: def.mono, size: 10 },
      callback: yCallback || (v => yPrefix + v.toFixed(0)),
    },
    grid: { color: def.grid }
  }
});

/* ─── Main Price Chart ──────────────────────────────────────── */
function renderMainChart(canvasId, ohlcv, predictions, range='3M') {
  destroyChart(canvasId);
  const filtered = filterByRange(ohlcv, range);
  const labels   = filtered.map(d => d.date);
  const closes   = filtered.map(d => d.close);
  const preds    = (predictions?.predicted || []).slice(-filtered.length);
  const sma20    = calcSMA(closes, 20);
  const bb       = calcBollingerBands(closes, 20);
  const def      = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  // gradient for actual line
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, 'rgba(79,124,245,0.18)');
  grad.addColorStop(1, 'rgba(79,124,245,0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Actual Price',  data:closes, borderColor:CHART_COLORS.actual,     borderWidth:2.5, pointRadius:0, tension:0.35, fill:true, backgroundColor:grad, order:1 },
        { label:'AI Prediction', data:preds,  borderColor:CHART_COLORS.prediction, borderWidth:2,   borderDash:[7,4], pointRadius:0, tension:0.35, fill:false, order:2 },
        { label:'SMA 20',  data:sma20, borderColor:CHART_COLORS.sma20, borderWidth:1.5, pointRadius:0, tension:0.35, fill:false, borderDash:[3,3], order:3 },
        { label:'BB Upper',data:bb.map(b=>b.upper), borderColor:CHART_COLORS.bbUpper, borderWidth:1, pointRadius:0, tension:0.35, fill:'+1', backgroundColor:CHART_COLORS.bbFill, order:4 },
        { label:'BB Lower',data:bb.map(b=>b.lower), borderColor:CHART_COLORS.bbLower, borderWidth:1, pointRadius:0, tension:0.35, fill:false, order:5 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins: {
        legend: { labels:{ color:def.tick, font:{ family:def.font, size:10 }, boxWidth:10, padding:14, usePointStyle:true } },
        tooltip:{ ...baseTooltip(def), callbacks:{ label:ctx=>` ${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2)??'--'}` } }
      },
      scales: baseScales(def, '$'),
    }
  });
}

/* ─── RSI ───────────────────────────────────────────────────── */
function renderRSI(canvasId, ohlcv, range='3M') {
  destroyChart(canvasId);
  const filtered = filterByRange(ohlcv, range);
  const rsi      = calcRSI(filtered.map(d=>d.close));
  const def      = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type:'line',
    data:{
      labels:filtered.map(d=>d.date),
      datasets:[{ label:'RSI (14)', data:rsi, borderColor:CHART_COLORS.rsi, borderWidth:1.8, pointRadius:0, tension:0.35, fill:false }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{ ...baseTooltip(def), callbacks:{label:ctx=>` RSI: ${ctx.parsed.y?.toFixed(1)}`} } },
      scales:{
        x:{display:false},
        y:{ min:0, max:100, ticks:{color:def.tick, font:{size:9}, stepSize:30}, grid:{color:def.grid} }
      }
    },
    plugins:[{
      afterDraw: chart => {
        const {ctx, chartArea, scales} = chart;
        if (!chartArea) return;
        const y70 = scales.y.getPixelForValue(70);
        const y30 = scales.y.getPixelForValue(30);
        ctx.save();
        ctx.fillStyle = CHART_COLORS.rsiOB;
        ctx.fillRect(chartArea.left, chartArea.top, chartArea.width, y70-chartArea.top);
        ctx.fillStyle = CHART_COLORS.rsiOS;
        ctx.fillRect(chartArea.left, y30, chartArea.width, chartArea.bottom-y30);
        ctx.setLineDash([5,4]);
        ctx.strokeStyle = 'rgba(244,63,94,0.45)';
        ctx.beginPath(); ctx.moveTo(chartArea.left,y70); ctx.lineTo(chartArea.right,y70); ctx.stroke();
        ctx.strokeStyle = 'rgba(34,197,94,0.45)';
        ctx.beginPath(); ctx.moveTo(chartArea.left,y30); ctx.lineTo(chartArea.right,y30); ctx.stroke();
        ctx.restore();
      }
    }]
  });
}

/* ─── MACD ──────────────────────────────────────────────────── */
function renderMACD(canvasId, ohlcv, range='3M') {
  destroyChart(canvasId);
  const filtered = filterByRange(ohlcv, range);
  const {macdLine,signalLine,histogram} = calcMACD(filtered.map(d=>d.close));
  const def = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type:'bar',
    data:{
      labels:filtered.map(d=>d.date),
      datasets:[
        { label:'Histogram', data:histogram, backgroundColor:histogram.map(v=>v>=0?CHART_COLORS.histPos:CHART_COLORS.histNeg), borderRadius:2, order:3 },
        { label:'MACD',   data:macdLine,   type:'line', borderColor:CHART_COLORS.macdLine,   borderWidth:1.8, pointRadius:0, tension:0.35, fill:false, order:1 },
        { label:'Signal', data:signalLine, type:'line', borderColor:CHART_COLORS.signalLine, borderWidth:1.8, pointRadius:0, tension:0.35, fill:false, order:2 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{labels:{color:def.tick, font:{size:10}, boxWidth:8, padding:10, usePointStyle:true}}, tooltip:baseTooltip(def) },
      scales:{ x:{display:false}, y:{ticks:{color:def.tick, font:{size:9}}, grid:{color:def.grid}} }
    }
  });
}

/* ─── Bollinger Bands ────────────────────────────────────────── */
function renderBollinger(canvasId, ohlcv, range='3M') {
  destroyChart(canvasId);
  const filtered = filterByRange(ohlcv, range);
  const closes   = filtered.map(d=>d.close);
  const bb       = calcBollingerBands(closes, 20);
  const def      = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type:'line',
    data:{
      labels:filtered.map(d=>d.date),
      datasets:[
        { label:'Price', data:closes,              borderColor:CHART_COLORS.actual,  borderWidth:1.8, pointRadius:0, tension:0.35, fill:false, order:1 },
        { label:'Upper', data:bb.map(b=>b.upper),  borderColor:CHART_COLORS.bbUpper, borderWidth:1,   pointRadius:0, tension:0.35, fill:'+1', backgroundColor:CHART_COLORS.bbFill, order:2 },
        { label:'Lower', data:bb.map(b=>b.lower),  borderColor:CHART_COLORS.bbLower, borderWidth:1,   pointRadius:0, tension:0.35, fill:false, order:3 },
        { label:'SMA20', data:bb.map(b=>b.middle), borderColor:CHART_COLORS.sma20,   borderWidth:1,   borderDash:[4,4], pointRadius:0, tension:0.35, fill:false, order:4 },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{labels:{color:def.tick, font:{size:10}, boxWidth:8, padding:8, usePointStyle:true}}, tooltip:{...baseTooltip(def), callbacks:{label:ctx=>` ${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2)??'--'}`}} },
      scales:{ x:{display:false}, y:{ticks:{color:def.tick, font:{size:9}, callback:v=>'$'+v.toFixed(0)}, grid:{color:def.grid}} }
    }
  });
}

/* ─── Volume ─────────────────────────────────────────────────── */
function renderVolume(canvasId, ohlcv, range='3M') {
  destroyChart(canvasId);
  const filtered = filterByRange(ohlcv, range);
  const def = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type:'bar',
    data:{
      labels:filtered.map(d=>d.date),
      datasets:[{
        label:'Volume', data:filtered.map(d=>d.volume),
        backgroundColor:filtered.map((d,i) => {
          if (i===0) return CHART_COLORS.volume;
          return d.close>=filtered[i-1].close?'rgba(34,197,94,0.5)':'rgba(244,63,94,0.5)';
        }),
        borderWidth:0, borderRadius:2,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:baseTooltip(def) },
      scales:{ x:{display:false}, y:{ticks:{color:def.tick, font:{size:9}, callback:v=>(v/1e6).toFixed(0)+'M'}, grid:{color:def.grid}} }
    }
  });
}

/* ─── Loss Curve ─────────────────────────────────────────────── */
function renderLossCurve(canvasId) {
  destroyChart(canvasId);
  const {trainLoss,valLoss,epochs} = generateLossCurve(50);
  const def = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type:'line',
    data:{
      labels:epochs,
      datasets:[
        { label:'Train', data:trainLoss, borderColor:CHART_COLORS.actual,      borderWidth:1.8, pointRadius:0, tension:0.4, fill:false },
        { label:'Val',   data:valLoss,   borderColor:CHART_COLORS.prediction,  borderWidth:1.8, pointRadius:0, tension:0.4, fill:false, borderDash:[5,4] },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{labels:{color:def.tick, font:{size:10}, boxWidth:8, padding:8, usePointStyle:true}}, tooltip:baseTooltip(def) },
      scales:{
        x:{ticks:{color:def.tick, font:{size:9}, maxTicksLimit:6}, grid:{color:def.grid}},
        y:{ticks:{color:def.tick, font:{size:9}}, grid:{color:def.grid}}
      }
    }
  });
}

/* ─── Sector Bar Chart ───────────────────────────────────────── */
function renderSectorChart() {
  destroyChart('sectorChart');
  const def = chartDefaults();
  const ctx = document.getElementById('sectorChart')?.getContext('2d');
  if (!ctx) return;
  const sectors = ['Tech','Semis','Banking','Streaming','Fintech','E-Commerce'];
  const rng  = seededRng(999);
  const perf = sectors.map(()=>+((rng()-0.4)*8).toFixed(2));

  new Chart(ctx, {
    type:'bar',
    data:{
      labels:sectors,
      datasets:[{ label:'Sector Return %', data:perf,
        backgroundColor:perf.map(v=>v>=0?'rgba(34,197,94,0.55)':'rgba(244,63,94,0.55)'),
        borderRadius:5,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{ legend:{display:false}, tooltip:baseTooltip(def) },
      scales:{
        x:{ticks:{color:def.tick, font:{size:9}, callback:v=>v+'%'}, grid:{color:def.grid}},
        y:{ticks:{color:def.tick, font:{size:9}}, grid:{display:false}}
      }
    }
  });
}

/* ─── Compare Charts ─────────────────────────────────────────── */
function renderCompareChart(canvasId, ohlcv, modelType, color) {
  destroyChart(canvasId);
  const filtered = filterByRange(ohlcv, '3M');
  const closes   = filtered.map(d=>d.close);
  const preds    = generatePredictions(filtered, modelType).predicted.slice(-filtered.length);
  const def      = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  new Chart(ctx, {
    type:'line',
    data:{
      labels:filtered.map(d=>d.date),
      datasets:[
        { label:'Actual',          data:closes, borderColor:'rgba(100,130,190,0.55)', borderWidth:1.5, pointRadius:0, tension:0.3, fill:false },
        { label:modelType.toUpperCase(), data:preds, borderColor:color, borderWidth:2, borderDash:[6,4], pointRadius:0, tension:0.3, fill:false },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:def.tick, font:{size:10}, boxWidth:8, padding:8, usePointStyle:true}},
        tooltip:{...baseTooltip(def), callbacks:{label:ctx=>` ${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2)??'--'}`}}
      },
      scales:{
        x:{ticks:{color:def.tick, font:{size:9}, maxTicksLimit:6, maxRotation:0}, grid:{color:def.grid}},
        y:{ticks:{color:def.tick, font:{size:9}, callback:v=>'$'+v.toFixed(0)}, grid:{color:def.grid}}
      }
    }
  });
}

/* ─── Forecast Chart ─────────────────────────────────────────── */
function renderForecastChart(canvasId, historical, projection, bull, bear) {
  destroyChart(canvasId);
  const def = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const histLabels = historical.map(d=>d.date);
  const histClose  = historical.map(d=>d.close);
  const projLabels = Array.from({length:projection.length},(_,i)=>`D+${i+1}`);
  const allLabels  = [...histLabels, ...projLabels];
  const pad = new Array(histClose.length).fill(null);

  new Chart(ctx, {
    type:'line',
    data:{
      labels:allLabels,
      datasets:[
        { label:'Historical',   data:[...histClose,...new Array(projection.length).fill(null)], borderColor:CHART_COLORS.actual,           borderWidth:2,   pointRadius:0, tension:0.3, fill:false },
        { label:'Base Case',    data:[...pad,...projection],  borderColor:CHART_COLORS.prediction,       borderWidth:2.5, pointRadius:0, tension:0.3, fill:false },
        { label:'Bull Case 🟢', data:[...pad,...bull],        borderColor:'rgba(34,197,94,0.85)',         borderWidth:1.5, borderDash:[5,4], pointRadius:0, tension:0.3, fill:false },
        { label:'Bear Case 🔴', data:[...pad,...bear],        borderColor:'rgba(244,63,94,0.85)',         borderWidth:1.5, borderDash:[5,4], pointRadius:0, tension:0.3, fill:false },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:def.tick, font:{family:def.font, size:10}, boxWidth:10, padding:14, usePointStyle:true}},
        tooltip:{...baseTooltip(def), callbacks:{label:ctx=>` ${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2)??'--'}`}}
      },
      scales:{
        x:{ticks:{color:def.tick, font:{size:9}, maxTicksLimit:10, maxRotation:0}, grid:{color:def.grid}},
        y:{ticks:{color:def.tick, font:{size:9}, callback:v=>'$'+v.toFixed(0)}, grid:{color:def.grid}}
      }
    }
  });
}

/* ─── Probability Chart ──────────────────────────────────────── */
function renderProbChart(canvasId, base, bull, baseCase, bear) {
  destroyChart(canvasId);
  const def = chartDefaults();
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;

  const range  = bull - bear;
  const points = 20;
  const labels = Array.from({length:points},(_,i)=>'$'+(bear+(range/points)*i).toFixed(0));
  const rng2   = seededRng(12345);
  const data   = Array.from({length:points},(_,i) => {
    const x = (i/points)*2 - 1;
    return Math.max(0, Math.exp(-x*x*2.5)*100 + (rng2()-0.5)*10);
  });

  new Chart(ctx, {
    type:'bar',
    data:{
      labels,
      datasets:[{
        label:'Probability',
        data,
        backgroundColor:data.map((_,i) => {
          const price = parseFloat(labels[i].slice(1));
          if (price > baseCase) return 'rgba(34,197,94,0.6)';
          if (price < baseCase) return 'rgba(244,63,94,0.5)';
          return 'rgba(245,166,35,0.7)';
        }),
        borderRadius:3,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:baseTooltip(def)},
      scales:{
        x:{ticks:{color:def.tick, font:{size:8}, maxTicksLimit:5, maxRotation:30}, grid:{display:false}},
        y:{ticks:{color:def.tick, font:{size:9}, callback:v=>v.toFixed(0)+'%'}, grid:{color:def.grid}}
      }
    }
  });
}

/* ─── Sentiment Chart ────────────────────────────────────────── */
function renderSentimentChart() {
  destroyChart('sentimentChart');
  const def = chartDefaults();
  const ctx = document.getElementById('sentimentChart')?.getContext('2d');
  if (!ctx) return;

  const tickers = ['NVDA','AAPL','TSLA','MSFT','GOOGL','META','AMZN'];
  const rng = seededRng(5555);
  const bull = tickers.map(()=>Math.floor(rng()*70+30));
  const bear = bull.map(v=>100-v);

  new Chart(ctx, {
    type:'bar',
    data:{
      labels:tickers,
      datasets:[
        { label:'Bullish %', data:bull, backgroundColor:'rgba(34,197,94,0.6)', borderRadius:4, stack:'s' },
        { label:'Bearish %', data:bear, backgroundColor:'rgba(244,63,94,0.5)', borderRadius:4, stack:'s' },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false, indexAxis:'y',
      plugins:{
        legend:{labels:{color:def.tick, font:{size:10}, boxWidth:8, padding:8, usePointStyle:true}},
        tooltip:baseTooltip(def)
      },
      scales:{
        x:{ticks:{color:def.tick, font:{size:9}, callback:v=>v+'%'}, stacked:true, max:100, grid:{color:def.grid}},
        y:{ticks:{color:def.tick, font:{size:10}}, stacked:true, grid:{display:false}}
      }
    }
  });
}

/* ─── Allocation Doughnut Chart ──────────────────────────────── */
function renderAllocationChart(rows) {
  destroyChart('allocationChart');
  const def = chartDefaults();
  const ctx = document.getElementById('allocationChart')?.getContext('2d');
  if (!ctx) return;

  if (!rows || !rows.length) {
    new Chart(ctx, {
      type:'doughnut',
      data:{ labels:['No positions'], datasets:[{data:[1], backgroundColor:['rgba(79,124,245,0.2)'], borderColor:'rgba(79,124,245,0.3)', borderWidth:1}] },
      options:{responsive:true,maintainAspectRatio:false, plugins:{legend:{display:false}}}
    });
    return;
  }

  const palette = ['#4f7cf5','#f5a623','#22c55e','#f43f5e','#a78bfa','#22d3ee','#f97316','#fbbf24'];
  const labels = rows.map(r=>r.ticker);
  const data   = rows.map(r=>r.val);

  new Chart(ctx, {
    type:'doughnut',
    data:{
      labels,
      datasets:[{
        data,
        backgroundColor:labels.map((_,i)=>palette[i%palette.length]+'cc'),
        borderColor:labels.map((_,i)=>palette[i%palette.length]),
        borderWidth:2,
        hoverOffset:6,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{labels:{color:def.tick, font:{size:10}, boxWidth:10, padding:8, usePointStyle:true}},
        tooltip:{...baseTooltip(def), callbacks:{label:ctx=>`${ctx.label}: $${ctx.parsed?.toFixed(2)??'--'}`}}
      },
      cutout:'65%',
    }
  });
}
