# 📈 StockAI Pro – Advanced Stock Prediction Dashboard

A professional AI-powered stock forecasting web app with LSTM, GRU, and Transformer models, interactive charts, and technical indicators.

---

## 🚀 Quick Start (Frontend Only)

Just double-click `index.html` in your browser — no server needed!

The frontend uses simulated data so you can explore all features instantly.

---

## ⚙️ Full Stack Setup (with real predictions)

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Flask backend
```bash
python app.py
```
Opens at: http://localhost:5000

### 3. Train a model via CLI
```bash
python model.py AAPL --models LSTM GRU Transformer
```

### 4. Or trigger training via the API
```bash
curl -X POST http://localhost:5000/api/train/AAPL \
  -H "Content-Type: application/json" \
  -d '{"models": ["LSTM", "GRU", "Transformer"]}'
```

---

## 📁 Project Structure

```
Stock_Predictor/
├── index.html          ← Main SPA dashboard
├── css/
│   └── style.css       ← Full dark/light theme styles
├── js/
│   ├── data.js         ← Simulated data + technical indicators engine
│   ├── charts.js       ← Chart.js rendering (RSI, MACD, Bollinger, etc.)
│   └── app.js          ← App controller, navigation, UI logic
├── app.py              ← Flask REST API backend
├── model.py            ← LSTM / GRU / Transformer ML pipeline
├── requirements.txt    ← Python dependencies
└── results/            ← Saved model outputs (auto-created)
```

---

## 🧠 Features

| Feature | Description |
|---|---|
| **Models** | LSTM, GRU, Transformer (attention) |
| **Indicators** | RSI, MACD, Bollinger Bands, SMA, EMA |
| **Data Source** | Yahoo Finance via yfinance |
| **Metrics** | RMSE, MAE, MAPE, R² |
| **Dashboard** | 4 pages: Home, Analytics, Model Compare, About |
| **Theme** | Dark / Light mode with smooth transition |
| **Watchlist** | Persistent per-browser watchlist |
| **Responsive** | Mobile + tablet friendly |

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/predict/<ticker>?model=LSTM` | Get predictions |
| POST | `/api/train/<ticker>` | Trigger training |
| GET | `/api/indicators/<ticker>` | Latest indicator values |
| GET | `/api/compare/<ticker>` | Compare all models |
| GET | `/api/status/<ticker>` | Check training status |

---

## ⚠️ Disclaimer

StockAI Pro is for **educational and research purposes only**. Model predictions are not financial advice. Always consult a qualified financial advisor before making investment decisions.
