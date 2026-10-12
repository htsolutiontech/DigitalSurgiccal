"""Chạy các ê kíp giả lập qua 3 kịch bản, gửi câu lệnh xAPI về máy chủ và in báo cáo.

Cách dùng:
  python tools/run_demo.py                      # chạy trong tiến trình, không cần máy chủ
  python tools/run_demo.py --serve              # tự bật máy chủ + bảng điều khiển, giữ chạy tới khi Ctrl+C
  python tools/run_demo.py --url http://127.0.0.1:8000   # gửi tới máy chủ đã bật sẵn bằng uvicorn
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Tránh lỗi in tiếng Việt trên một số cửa sổ dòng lệnh Windows
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

from simcore import load_all  # noqa: E402
from simcore.replay import TEAMS, team_run  # noqa: E402

HEAD = {"Content-Type": "application/json", "X-Experience-API-Version": "1.0.3"}


class ServerUnavailable(RuntimeError):
    pass


def server_ready(url: str, timeout_s: float = 0.0) -> bool:
    """Kiểm tra máy chủ qua /health; chờ tối đa timeout_s giây."""
    deadline = time.time() + timeout_s
    while True:
        try:
            with urllib.request.urlopen(url.rstrip("/") + "/health", timeout=2) as r:
                return r.status == 200
        except (urllib.error.URLError, ConnectionError, OSError):
            if time.time() >= deadline:
                return False
            time.sleep(0.3)


def post_http(url: str, stmts: list[dict], token: str | None) -> None:
    h = dict(HEAD)
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url.rstrip("/") + "/xapi/statements", data=json.dumps(stmts).encode("utf-8"),
                                 headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
    except urllib.error.HTTPError as e:
        raise ServerUnavailable(f"Máy chủ từ chối dữ liệu (HTTP {e.code}): {e.read().decode('utf-8', 'replace')[:300]}") from None
    except (urllib.error.URLError, ConnectionError, OSError) as e:
        raise ServerUnavailable(f"Không kết nối được {url}: {e}") from None


def start_server(host: str, port: int) -> None:
    """Bật uvicorn trong luồng nền của chính tiến trình này."""
    try:
        import uvicorn
        from backend.app import app
    except Exception as e:  # thiếu thư viện hoặc lỗi tương thích phiên bản Python
        raise ServerUnavailable(f"Không khởi động được máy chủ: {e!r}. Chạy: pip install -r requirements.txt") from None
    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()


HELP_NO_SERVER = """
Không kết nối được máy chủ tại {url}.
Nguyên nhân thường gặp:
  1. Chưa bật máy chủ. Mở MỘT cửa sổ dòng lệnh khác, tại thư mục dự án, chạy:
         python -m uvicorn backend.app:app --port 8000
     giữ cửa sổ đó mở, rồi chạy lại lệnh này ở cửa sổ thứ hai.
  2. Máy chủ bật ở cổng khác: sửa --url cho đúng cổng.
  3. Hoặc dùng một lệnh duy nhất, tự bật máy chủ:
         python tools/run_demo.py --serve
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="địa chỉ máy chủ đã bật sẵn, ví dụ http://127.0.0.1:8000")
    ap.add_argument("--serve", action="store_true", help="tự bật máy chủ và bảng điều khiển")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-keep", action="store_true", help="với --serve: tắt máy chủ sau khi gửi xong")
    ap.add_argument("--token")
    ap.add_argument("--open", action="store_true", help="tự mở trình duyệt vào trang mô phỏng")
    ap.add_argument("--host", default="127.0.0.1", help="0.0.0.0 để máy khác trong mạng nội bộ truy cập")
    a = ap.parse_args()

    url = a.url
    if a.serve:
        url = f"http://127.0.0.1:{a.port}"
        if server_ready(url):
            print(f"Đã có máy chủ chạy tại {url}, dùng lại máy chủ này.")
        else:
            try:
                start_server(a.host, a.port)
            except ServerUnavailable as e:
                print(e, file=sys.stderr)
                return 1
            if not server_ready(url, timeout_s=15):
                print(f"Máy chủ không phản hồi sau 15 giây. Cổng {a.port} có thể đang bị chương trình khác dùng; thử --port 8010.",
                      file=sys.stderr)
                return 1
    elif url and not server_ready(url, timeout_s=3):
        print(HELP_NO_SERVER.format(url=url), file=sys.stderr)
        return 1

    scenarios = load_all(ROOT / "scenarios")
    client = None
    if not url:
        from fastapi.testclient import TestClient
        from backend.app import app
        client = TestClient(app)

    print(f"{'Kịch bản':<25}{'Ê kíp':<18}{'Điểm':>6}  {'Kết quả':<10}{'Thời gian':>10}  Lỗi")
    for sid, teams in TEAMS.items():
        for team, rows in teams.items():
            out = team_run(scenarios, sid, team, rows)
            try:
                if client:
                    client.post("/xapi/statements", json=out.statements, headers=HEAD).raise_for_status()
                else:
                    post_http(url, out.statements, a.token)
            except ServerUnavailable as e:
                print(f"\n{e}", file=sys.stderr)
                return 1
            res = out.result
            errs = "; ".join(i.message for i in res.issues)
            if res.missed_critical:
                errs = f"Bỏ sót: {', '.join(res.missed_critical)}" + (f"; {errs}" if errs else "")
            print(f"{sid:<25}{team:<18}{res.score:>6}  {'Đạt' if res.passed else 'Không đạt':<10}{res.duration_s:>8} s  {errs or '–'}")

    if client:
        print("\nTóm tắt:", json.dumps(client.get("/api/summary").json(), ensure_ascii=False, indent=1)[:900])
    elif a.serve and not a.no_keep:
        print(f"\nHệ thống mô phỏng:  {url}/sim")
        print(f"Bảng điều khiển:    {url}/")
        if a.host == "0.0.0.0":
            print("Máy khác trong mạng nội bộ truy cập bằng địa chỉ IP của máy này, ví dụ http://192.168.1.10:%d/sim" % a.port)
        if a.open:
            import webbrowser
            webbrowser.open(f"{url}/sim")
        print("(nhấn Ctrl+C để tắt máy chủ)")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("Đã tắt máy chủ.")
    else:
        print(f"\nBảng điều khiển: {url}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
