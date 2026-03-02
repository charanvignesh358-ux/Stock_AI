"""
StockAI Pro – Advanced Multi-Model Stock Predictor
Supports LSTM, GRU, and Transformer architectures
"""

import numpy as np
import pandas as pd
import warnings
warnings.filterwarnings('ignore')

# ── DATA COLLECTION
try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False
    print("[WARN] yfinance not installed. Run: pip install yfinance")

# ── DEEP LEARNING
try:
    import tensorflow as tf
    from tensorflow.keras.models import Sequential, Model
    from tensorflow.keras.layers import (LSTM, GRU, Dense, Dropout,
        MultiHeadAttention, LayerNormalization, GlobalAveragePooling1D, Input)
    from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("[WARN] TensorFlow not installed. Run: pip install tensorflow")

from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
import json, os

LOOKBACK   = 60
EPOCHS     = 50
BATCH_SIZE = 32
TEST_SPLIT = 0.20


# ─────────────────────────────────────────────────────────────────
#  1. DATA FETCHING
# ─────────────────────────────────────────────────────────────────
def fetch_data(ticker: str, period: str = "2y") -> pd.DataFrame:
    """Fetch OHLCV data from Yahoo Finance."""
    if not YF_AVAILABLE:
        raise RuntimeError("yfinance not installed.")
    df = yf.download(ticker, period=period, auto_adjust=True, progress=False)
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df.columns = [c.lower() for c in df.columns]
    return df


# ─────────────────────────────────────────────────────────────────
#  2. TECHNICAL INDICATORS
# ─────────────────────────────────────────────────────────────────
def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    close = df['close']

    # RSI(14)
    delta = close.diff()
    gain  = delta.clip(lower=0).rolling(14).mean()
    loss  = (-delta.clip(upper=0)).rolling(14).mean()
    rs    = gain / loss.replace(0, 1e-10)
    df['rsi'] = 100 - (100 / (1 + rs))

    # MACD(12,26,9)
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    df['macd']        = ema12 - ema26
    df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
    df['macd_hist']   = df['macd'] - df['macd_signal']

    # Bollinger Bands(20, 2σ)
    sma20         = close.rolling(20).mean()
    std20         = close.rolling(20).std()
    df['bb_upper'] = sma20 + 2 * std20
    df['bb_lower'] = sma20 - 2 * std20
    df['bb_mid']   = sma20
    df['bb_pct']   = (close - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'] + 1e-10)

    # Moving Averages
    df['sma20']  = sma20
    df['sma50']  = close.rolling(50).mean()
    df['sma200'] = close.rolling(200).mean()
    df['ema12']  = ema12
    df['ema26']  = ema26

    # Volatility
    df['returns']    = close.pct_change()
    df['volatility'] = df['returns'].rolling(20).std()

    # Volume trend
    df['vol_sma20'] = df['volume'].rolling(20).mean()
    df['vol_ratio'] = df['volume'] / df['vol_sma20'].replace(0, 1)

    return df


# ─────────────────────────────────────────────────────────────────
#  3. PREPROCESSING
# ─────────────────────────────────────────────────────────────────
FEATURE_COLS = [
    'close','open','high','low','volume',
    'rsi','macd','macd_signal','macd_hist',
    'bb_upper','bb_lower','bb_pct',
    'sma20','sma50','ema12','ema26',
    'returns','volatility','vol_ratio',
]

def preprocess(df: pd.DataFrame):
    df = add_indicators(df.copy())
    df.dropna(inplace=True)

    # Outlier removal via rolling Z-score on returns
    z = ((df['returns'] - df['returns'].rolling(20).mean()) /
         (df['returns'].rolling(20).std() + 1e-10)).abs()
    df = df[z < 3.5].copy()

    features = [c for c in FEATURE_COLS if c in df.columns]
    data = df[features].values

    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled = scaler.fit_transform(data)

    X, y = [], []
    for i in range(LOOKBACK, len(scaled)):
        X.append(scaled[i - LOOKBACK:i])
        y.append(scaled[i, 0])   # predict 'close'

    X, y = np.array(X), np.array(y)
    split = int(len(X) * (1 - TEST_SPLIT))
    return (X[:split], y[:split]), (X[split:], y[split:]), scaler, features, df


# ─────────────────────────────────────────────────────────────────
#  4. MODELS
# ─────────────────────────────────────────────────────────────────
def build_lstm(input_shape):
    model = Sequential([
        LSTM(128, return_sequences=True, input_shape=input_shape),
        Dropout(0.2),
        LSTM(64, return_sequences=False),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(1),
    ], name='LSTM_Model')
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    return model


def build_gru(input_shape):
    model = Sequential([
        GRU(128, return_sequences=True, input_shape=input_shape),
        Dropout(0.2),
        GRU(64, return_sequences=False),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(1),
    ], name='GRU_Model')
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    return model


def build_transformer(input_shape):
    """Simple Transformer encoder for time-series."""
    inp = Input(shape=input_shape)
    # Positional encoding approximation via projection
    x = Dense(64)(inp)
    # Multi-head self-attention block
    attn_out = MultiHeadAttention(num_heads=4, key_dim=16)(x, x)
    x = LayerNormalization()(x + attn_out)
    # Feed-forward block
    ff = Dense(128, activation='relu')(x)
    ff = Dense(64)(ff)
    x = LayerNormalization()(x + ff)
    x = GlobalAveragePooling1D()(x)
    x = Dense(32, activation='relu')(x)
    out = Dense(1)(x)
    model = Model(inputs=inp, outputs=out, name='Transformer_Model')
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    return model


BUILDERS = {
    'LSTM':        build_lstm,
    'GRU':         build_gru,
    'Transformer': build_transformer,
}


# ─────────────────────────────────────────────────────────────────
#  5. TRAINING
# ─────────────────────────────────────────────────────────────────
def train_model(model_name: str, X_train, y_train, X_test, y_test):
    if not TF_AVAILABLE:
        raise RuntimeError("TensorFlow not installed.")

    builder = BUILDERS[model_name]
    model   = builder((X_train.shape[1], X_train.shape[2]))

    callbacks = [
        EarlyStopping(patience=8, restore_best_weights=True, monitor='val_loss'),
        ReduceLROnPlateau(factor=0.5, patience=4, monitor='val_loss'),
    ]

    history = model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        callbacks=callbacks,
        verbose=1,
    )
    return model, history


# ─────────────────────────────────────────────────────────────────
#  6. EVALUATION
# ─────────────────────────────────────────────────────────────────
def evaluate(model, X_test, y_test, scaler, n_features):
    """Inverse-transform predictions and compute metrics."""
    pred_scaled = model.predict(X_test, verbose=0).flatten()

    # Inverse-transform only the 'close' column (index 0)
    def inv(arr):
        dummy = np.zeros((len(arr), n_features))
        dummy[:, 0] = arr
        return scaler.inverse_transform(dummy)[:, 0]

    pred_actual = inv(pred_scaled)
    true_actual = inv(y_test)

    rmse = float(np.sqrt(mean_squared_error(true_actual, pred_actual)))
    mae  = float(mean_absolute_error(true_actual, pred_actual))
    mape = float(np.mean(np.abs((true_actual - pred_actual) / (true_actual + 1e-10))) * 100)

    return {
        'rmse':       round(rmse, 4),
        'mae':        round(mae, 4),
        'mape':       round(mape, 4),
        'pred':       pred_actual.tolist(),
        'actual':     true_actual.tolist(),
    }


# ─────────────────────────────────────────────────────────────────
#  7. NEXT-DAY FORECAST
# ─────────────────────────────────────────────────────────────────
def next_day_forecast(model, last_sequence, scaler, n_features):
    """Predict next trading day's close price."""
    seq = last_sequence.reshape(1, LOOKBACK, n_features)
    pred_s = model.predict(seq, verbose=0)[0, 0]
    dummy  = np.zeros((1, n_features))
    dummy[0, 0] = pred_s
    price = scaler.inverse_transform(dummy)[0, 0]
    return round(float(price), 2)


# ─────────────────────────────────────────────────────────────────
#  8. FULL PIPELINE
# ─────────────────────────────────────────────────────────────────
def run_pipeline(ticker: str, models: list = None, save_dir: str = 'results'):
    """
    Full train + evaluate pipeline.

    Parameters
    ----------
    ticker  : Stock ticker symbol, e.g. 'AAPL'
    models  : List of model names to train, e.g. ['LSTM','GRU','Transformer']
    save_dir: Directory to save result JSON files

    Returns
    -------
    dict: Results keyed by model name
    """
    if models is None:
        models = ['LSTM', 'GRU', 'Transformer']

    os.makedirs(save_dir, exist_ok=True)
    print(f"\n{'='*55}")
    print(f"  StockAI Pro Pipeline  |  Ticker: {ticker}")
    print(f"{'='*55}\n")

    # Data
    print("[1/4] Fetching data…")
    df = fetch_data(ticker)
    print(f"      {len(df)} trading days loaded.")

    # Preprocess
    print("[2/4] Preprocessing + computing indicators…")
    (X_tr, y_tr), (X_te, y_te), scaler, features, df_proc = preprocess(df)
    n_features = X_tr.shape[2]
    print(f"      Train: {len(X_tr)}  |  Test: {len(X_te)}  |  Features: {n_features}")

    results = {}

    # Train each model
    print("[3/4] Training models…\n")
    for name in models:
        print(f"  ── {name} ──")
        mdl, hist = train_model(name, X_tr, y_tr, X_te, y_te)
        metrics   = evaluate(mdl, X_te, y_te, scaler, n_features)
        next_p    = next_day_forecast(mdl, X_te[-1], scaler, n_features)

        metrics['next_day'] = next_p
        metrics['history']  = {
            'loss':     [round(v,6) for v in hist.history['loss']],
            'val_loss': [round(v,6) for v in hist.history['val_loss']],
        }
        results[name] = metrics

        print(f"     RMSE: {metrics['rmse']}  |  MAE: {metrics['mae']}  |  "
              f"MAPE: {metrics['mape']}%  |  Next Day: ${next_p}\n")

    # Save results
    print("[4/4] Saving results…")
    out_path = os.path.join(save_dir, f"{ticker}_results.json")
    with open(out_path, 'w') as f:
        json.dump({'ticker': ticker, 'models': results}, f, indent=2)
    print(f"      Saved → {out_path}")

    return results


# ─────────────────────────────────────────────────────────────────
#  CLI ENTRY POINT
# ─────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='StockAI Pro – Model Trainer')
    parser.add_argument('ticker', type=str, help='Stock ticker (e.g. AAPL)')
    parser.add_argument('--models', nargs='+', default=['LSTM','GRU','Transformer'],
                        choices=['LSTM','GRU','Transformer'])
    parser.add_argument('--save', type=str, default='results')
    args = parser.parse_args()

    results = run_pipeline(args.ticker, args.models, args.save)

    print("\n── Final Summary ──")
    for model, m in results.items():
        print(f"  {model:12s}  RMSE={m['rmse']}  MAE={m['mae']}  "
              f"MAPE={m['mape']}%  Next=${m['next_day']}")
