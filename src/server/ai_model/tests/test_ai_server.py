import pytest
import json
import os
import joblib
import numpy as np
from ai_server import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_endpoint(client):
    """GET /health returns 200"""
    response = client.get('/health')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert 'status' in data
    assert data['status'] == 'running'

def test_predict_normal_vitals(client):
    """POST /predict_anomaly with normal values, assert is_anomaly == False"""
    normal_history = [
        {"temperature": 38.5, "heartRate": 65, "activityLevel": 5, "appetite": 4.0}
        for _ in range(5)
    ]
    response = client.post('/predict_anomaly', 
                             data=json.dumps({"history": normal_history}),
                             content_type='application/json')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['is_anomaly'] == False
    assert data['status'] == 'Healthy'

def test_predict_anomalous_vitals(client):
    """POST /predict_anomaly with extreme values, assert is_anomaly == True"""
    anomalous_history = [
        {"temperature": 41.5, "heartRate": 120, "activityLevel": 1, "appetite": 1.0}
        for _ in range(5)
    ]
    response = client.post('/predict_anomaly', 
                             data=json.dumps({"history": anomalous_history}),
                             content_type='application/json')
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['is_anomaly'] == True
    assert data['status'] in ['Warning', 'Critical']

def test_missing_fields_returns_400(client):
    """incomplete payload returns 400"""
    response = client.post('/predict_anomaly', 
                             data=json.dumps({"not_history": []}),
                             content_type='application/json')
    assert response.status_code == 400

def test_scaler_output_shape():
    """load feature_scaler, assert transform output shape == (1, 4) or similar"""
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    scaler_path = os.path.join(BASE_DIR, "feature_scaler")
    if os.path.exists(scaler_path):
        scaler = joblib.load(scaler_path)
        test_input = np.array([[38.5, 5, 3.5, 65]])
        output = scaler.transform(test_input)
        assert output.shape == (1, 4)
