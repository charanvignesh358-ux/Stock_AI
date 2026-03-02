"""
StockAI Pro – Flask Backend API
Connects the frontend dashboard to the Python ML models.
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import numpy as np
import json, os, threading

# Absolute path to the project root (works on both local and Render)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR, static_url_path='')

# Fix MIME types for CSS and JS
import mimetypes
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
CORS(app)

RESULTS_DIR = os.path.join(BASE_DIR, 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)

# ── In-memory cache
_cache = {}

def get_results(ticker: str):
    path = os.path.join(RESULTS_DIR, f"{ticker.upper()}_results.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    """Serve CSS, JS, and other static assets."""
    file_path = os.path.join(BASE_DIR, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(os.path.dirname(file_path), os.path.basename(file_path))
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/api/predict/<ticker>')
def predict(ticker):
    ticker = ticker.upper()
    model  = request.args.get('model', 'LSTM')

    # Try cached results first
    results = get_results(ticker)
    if results and model in results.get('models', {}):
        m = results['models'][model]
        return jsonify({
            'ticker':   ticker,
            'model':    model,
            'next_day': m['next_day'],
            'rmse':     m['rmse'],
            'mae':      m['mae'],
            'mape':     m['mape'],
            'actual':   m['actual'][-60:],
            'pred':     m['pred'][-60:],
        })

    # No cached results → trigger training in background
    return jsonify({
        'status': 'training',
        'message': f'Training {model} for {ticker}. Please call /api/train/{ticker} first.'
    }), 202


@app.route('/api/train/<ticker>', methods=['POST'])
def train(ticker):
    """Trigger full pipeline training."""
    ticker = ticker.upper()
    data   = request.json or {}
    models = data.get('models', ['LSTM', 'GRU', 'Transformer'])

    def run():
        try:
            from model import run_pipeline
            run_pipeline(ticker, models, RESULTS_DIR)
        except Exception as e:
            print(f"[ERROR] Training failed: {e}")

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return jsonify({'status': 'started', 'ticker': ticker, 'models': models})


@app.route('/api/status/<ticker>')
def status(ticker):
    results = get_results(ticker.upper())
    if results:
        return jsonify({'status': 'ready', 'models': list(results['models'].keys())})
    return jsonify({'status': 'not_trained'})


@app.route('/api/indicators/<ticker>')
def indicators(ticker):
    """Return latest indicator values for a ticker."""
    try:
        from model import fetch_data, add_indicators
        df = fetch_data(ticker.upper(), period='3mo')
        df = add_indicators(df)
        last = df.iloc[-1]
        return jsonify({
            'ticker':      ticker.upper(),
            'close':       round(float(last['close']), 2),
            'rsi':         round(float(last['rsi']), 2),
            'macd':        round(float(last['macd']), 4),
            'macd_signal': round(float(last['macd_signal']), 4),
            'bb_upper':    round(float(last['bb_upper']), 2),
            'bb_lower':    round(float(last['bb_lower']), 2),
            'bb_pct':      round(float(last['bb_pct']), 4),
            'sma20':       round(float(last['sma20']), 2),
            'sma50':       round(float(last['sma50']), 2),
            'ema12':       round(float(last['ema12']), 2),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/compare/<ticker>')
def compare(ticker):
    """Return comparison metrics for all models."""
    results = get_results(ticker.upper())
    if not results:
        return jsonify({'error': 'No results. Train the models first.'}), 404
    comparison = {}
    for name, m in results['models'].items():
        comparison[name] = {
            'rmse':     m['rmse'],
            'mae':      m['mae'],
            'mape':     m['mape'],
            'next_day': m['next_day'],
        }
    return jsonify({'ticker': ticker.upper(), 'comparison': comparison})


if __name__ == '__main__':
    print("\n StockAI Pro API Server")
    print(" Open: http://localhost:5000")
    print(" Endpoints:")
    print("   GET  /api/predict/<ticker>?model=LSTM")
    print("   POST /api/train/<ticker>  {models:[LSTM,GRU,Transformer]}")
    print("   GET  /api/indicators/<ticker>")
    print("   GET  /api/compare/<ticker>\n")
    app.run(debug=True, port=5000)
