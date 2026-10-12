import pytest
from fastapi.testclient import TestClient

SID, KEY = "m5_lap_appendectomy_ntp", "yt_lFUi_ozMJUc"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ROBO_DB", str(tmp_path / "m.db"))
    for k in ("ROBO_INSTRUCTORS", "ROBO_ENV", "ROBO_CLASS_CODE", "ROBO_TOKEN"):
        monkeypatch.delenv(k, raising=False)
    from backend.app import app
    return TestClient(app)


def test_catalog_has_video_without_markers(client):
    v = client.get(f"/api/media/{SID}").json()
    assert v[0]["video_id"] == "lFUi_ozMJUc" and v[0]["markers"] == {} and v[0]["total_steps"] == 38
    assert client.get("/api/media/m2_sterile_basics").json() == []
    assert client.get("/api/media/khong_co").status_code == 404


def test_put_marker_validation_and_roundtrip(client):
    u = f"/api/media/{SID}/{KEY}/markers/s4_ligate"
    assert client.put(u, json={"start": 50, "end": 40}).status_code == 422
    assert client.put(f"/api/media/{SID}/{KEY}/markers/khong_co", json={"start": 1, "end": 2}).status_code == 404
    r = client.put(u, json={"start": 125.5, "end": 160, "note": "Dùng clip Hem-o-lok", "differs": True, "author": "GV A"})
    assert r.status_code == 200
    m = client.get(f"/api/media/{SID}").json()[0]["markers"]
    assert m["s4_ligate"]["differs"] and m["s4_ligate"]["start"] == 125.5
    exp = client.get(f"/api/media/{SID}/{KEY}/export").json()
    assert exp["markers"]["s4_ligate"]["note"] == "Dùng clip Hem-o-lok"
    client.delete(u)
    assert client.get(f"/api/media/{SID}").json()[0]["markers"] == {}
    imp = client.post(f"/api/media/{SID}/{KEY}/import", json={"markers": exp["markers"], "replace": True})
    assert imp.json()["imported"] == 1
    assert client.post(f"/api/media/{SID}/{KEY}/import", json={"markers": {"zzz": {"start": 1, "end": 2}}}).status_code == 400


def test_marker_writes_need_instructor_when_auth_enabled(client, monkeypatch):
    import base64
    from backend.settings import hash_password
    monkeypatch.setenv("ROBO_INSTRUCTORS", "gv1=" + hash_password("mk-dung", iterations=1000))
    u = f"/api/media/{SID}/{KEY}/markers/s2_explore"
    assert client.put(u, json={"start": 1, "end": 2}).status_code == 401
    good = {"Authorization": "Basic " + base64.b64encode(b"gv1:mk-dung").decode()}
    assert client.put(u, json={"start": 1, "end": 2}, headers=good).status_code == 200
    assert client.get(f"/api/media/{SID}").status_code == 200            # mô phỏng của sinh viên vẫn đọc được
    assert client.get(f"/api/media/{SID}/{KEY}/export").status_code == 401
    assert client.get("/video-markers").status_code == 401
