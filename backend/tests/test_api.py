from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_lists_core_endpoints():
    paths = TestClient(app).get("/openapi.json").json()["paths"]
    for p in ["/health", "/scans", "/scans/{scan_id}", "/findings", "/alerts", "/stats"]:
        assert p in paths