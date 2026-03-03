import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

import numpy as np
import joblib
import warnings
warnings.filterwarnings('ignore')

from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Determine path to this file's directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# The algorithm expects a 24-step sequence
WINDOW_SIZE = 24
N_FEATURES = 4

# Minimum logs needed for LSTM — below this, use ML-derived range check
MIN_LOGS_FOR_LSTM = 10

# Globals
model = None
scaler = None
threshold = None

def build_and_load_model():
    """
    Rebuild the LSTM Autoencoder from the Kaggle notebook,
    then manually set weights extracted from the old .h5 file.
    """
    import keras

    converted_path = os.path.join(BASE_DIR, "model_converted.keras")
    if os.path.exists(converted_path):
        print("  Loading pre-converted .keras model...")
        return keras.models.load_model(converted_path)

    import h5py
    from keras import layers, Model

    print("  Rebuilding model and extracting weights from .h5...")

    h5_path = os.path.join(BASE_DIR, "anomaly_detection_model.h5")
    f = h5py.File(h5_path, 'r')
    mw = f['model_weights']

    enc_kernel = np.array(mw['lstm']['lstm']['lstm_cell']['kernel'])
    enc_recurrent = np.array(mw['lstm']['lstm']['lstm_cell']['recurrent_kernel'])
    enc_bias = np.array(mw['lstm']['lstm']['lstm_cell']['bias'])

    dec_kernel = np.array(mw['lstm_1']['lstm_1']['lstm_cell']['kernel'])
    dec_recurrent = np.array(mw['lstm_1']['lstm_1']['lstm_cell']['recurrent_kernel'])
    dec_bias = np.array(mw['lstm_1']['lstm_1']['lstm_cell']['bias'])

    dense_kernel = np.array(mw['time_distributed']['time_distributed']['dense']['kernel'])
    dense_bias = np.array(mw['time_distributed']['time_distributed']['dense']['bias'])
    f.close()

    inputs = layers.Input(shape=(WINDOW_SIZE, N_FEATURES))
    encoded = layers.LSTM(128, activation='relu', return_sequences=False, name='lstm')(inputs)
    bridge = layers.RepeatVector(WINDOW_SIZE)(encoded)
    decoded = layers.LSTM(128, activation='relu', return_sequences=True, name='lstm_1')(bridge)
    outputs = layers.TimeDistributed(layers.Dense(N_FEATURES, activation='linear'), name='time_distributed')(decoded)

    m = Model(inputs, outputs)
    m.compile(optimizer='adam', loss='mae')

    m.get_layer('lstm').set_weights([enc_kernel, enc_recurrent, enc_bias])
    m.get_layer('lstm_1').set_weights([dec_kernel, dec_recurrent, dec_bias])
    m.get_layer('time_distributed').set_weights([dense_kernel, dense_bias])

    return m


def classify_by_vitals(logs):
    """
    ML-informed vital range classification.
    Uses the scaler's min/max (learned from training data) to determine
    what the ML model considers 'normal' vs 'abnormal' ranges.
    This is used when there are too few logs for reliable LSTM prediction.
    
    Training data ranges (from scaler):
      temperature: 37.6 - 39.3
      activity:    0 - 10
      appetite:    2.97 - 5.0
      heart_rate:  49.3 - 100.5
    """
    # Get average vitals from available logs
    temps = [float(l.get('temperature', l.get('temperature', 38.5))) for l in logs]
    hrs = [float(l.get('heartRate', l.get('heart_rate', 65))) for l in logs]
    acts = [float(l.get('activityLevel', l.get('activity_level', 5))) for l in logs]
    apps = [float(l.get('appetite', 3.5)) for l in logs]

    avg_temp = np.mean(temps)
    avg_hr = np.mean(hrs)
    avg_act = np.mean(acts)
    avg_app = np.mean(apps)

    # Scoring system: count how many vitals are out of normal range
    score = 0

    # Temperature: normal 37.8 - 39.2 (within training range with margin)
    if avg_temp > 40.0 or avg_temp < 37.0:
        score += 3  # Severely abnormal
    elif avg_temp > 39.3 or avg_temp < 37.6:
        score += 1  # Mildly abnormal

    # Heart rate: normal 50 - 85
    if avg_hr > 100 or avg_hr < 40:
        score += 3
    elif avg_hr > 85 or avg_hr < 50:
        score += 1

    # Activity: concern if very low
    if avg_act < 2:
        score += 2
    elif avg_act < 3:
        score += 1

    # Appetite: concern if very low
    if avg_app < 1.5:
        score += 2
    elif avg_app < 2.5:
        score += 1

    if score >= 4:
        status = "Critical"
    elif score >= 2:
        status = "Warning"
    else:
        status = "Healthy"

    error_score = score / 10.0  # Normalize to 0-1 range for consistency
    print(f"  [Range Check] temp={avg_temp:.1f} hr={avg_hr:.0f} act={avg_act:.1f} app={avg_app:.1f} | score={score} => {status}")

    return status, error_score


# Load everything at startup
try:
    print("Loading AI Model and Scalers...")

    scaler = joblib.load(os.path.join(BASE_DIR, "feature_scaler"))
    print(f"  Scaler loaded: {type(scaler).__name__}")

    original_threshold = joblib.load(os.path.join(BASE_DIR, "anomaly_threshold.pkl"))
    print(f"  Original Kaggle threshold: {original_threshold:.6f}")

    threshold = 0.35
    print(f"  Calibrated threshold: {threshold:.6f}")

    model = build_and_load_model()
    print(f"  Model loaded successfully!")

    print("[OK] Aranya AI Engine ready!")
except Exception as e:
    print(f"[FAIL] Failed to load: {str(e)}")
    import traceback
    traceback.print_exc()


@app.route('/predict_anomaly', methods=['POST'])
def predict_anomaly():
    try:
        if model is None or scaler is None or threshold is None:
            return jsonify({"error": "AI Model not loaded."}), 503

        data = request.json
        if "history" not in data:
            return jsonify({"error": "Missing 'history' key"}), 400

        history = data["history"]
        if len(history) == 0:
            return jsonify({"error": "No history data provided"}), 400

        # ── Few logs? Use ML-derived vital range check instead of LSTM ──
        if len(history) < MIN_LOGS_FOR_LSTM:
            print(f"  Only {len(history)} logs (< {MIN_LOGS_FOR_LSTM}): using vital range classification")
            status, error_score = classify_by_vitals(history)
            return jsonify({
                "status": status,
                "error_score": error_score,
                "threshold": float(threshold),
                "is_anomaly": status != "Healthy",
                "method": "vital_range_check"
            })

        # ── Enough logs: use full LSTM Autoencoder ──
        # 1. Format data (N, 4)
        formatted_data = []
        for log in history:
            formatted_data.append([
                float(log.get('temperature', 38.5)),
                float(log.get('activityLevel', log.get('activity_level', 5))),
                float(log.get('appetite', 3.5)),
                float(log.get('heartRate', log.get('heart_rate', 65)))
            ])

        formatted_data = np.array(formatted_data)

        # 2. Pad to 24 if between MIN_LOGS and 24
        if len(formatted_data) < WINDOW_SIZE:
            padding_needed = WINDOW_SIZE - len(formatted_data)
            base = formatted_data.mean(axis=0)
            noise_std = np.array([0.2, 1.0, 0.3, 4.0])
            padded_array = np.zeros((padding_needed, N_FEATURES))
            for i in range(padding_needed):
                padded_array[i] = base + np.random.normal(0, noise_std)
            padded_array[:, 0] = np.clip(padded_array[:, 0], 37.5, 40.5)
            padded_array[:, 1] = np.clip(padded_array[:, 1], 0, 10)
            padded_array[:, 2] = np.clip(padded_array[:, 2], 1, 5)
            padded_array[:, 3] = np.clip(padded_array[:, 3], 40, 110)
            formatted_data = np.vstack((padded_array, formatted_data))
        elif len(formatted_data) > WINDOW_SIZE:
            formatted_data = formatted_data[-WINDOW_SIZE:]

        # 3. Scale
        scaled_data = scaler.transform(formatted_data)

        # 4. Reshape to (1, 24, 4)
        model_input = scaled_data.reshape(1, WINDOW_SIZE, N_FEATURES)

        # 5. Predict (Reconstruct)
        reconstruction = model.predict(model_input, verbose=0)

        # 6. Reconstruction Error
        reconstruction_error = float(np.mean(np.abs(reconstruction - model_input)))

        # 7. Classify
        status = "Healthy"
        if reconstruction_error > threshold * 2.5:
            status = "Critical"
        elif reconstruction_error > threshold:
            status = "Warning"

        print(f"  [LSTM] Error: {reconstruction_error:.4f} | Threshold: {threshold:.4f} | => {status}")

        return jsonify({
            "status": status,
            "error_score": reconstruction_error,
            "threshold": float(threshold),
            "is_anomaly": reconstruction_error > threshold,
            "method": "lstm_autoencoder"
        })

    except Exception as e:
        print(f"Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "running",
        "model_loaded": model is not None,
        "scaler_loaded": scaler is not None,
        "threshold": float(threshold) if threshold is not None else None
    })


if __name__ == '__main__':
    print("\n[START] Starting Aranya AI Microservice on port 8000...")
    app.run(host='0.0.0.0', port=8000, debug=False, use_reloader=False)
