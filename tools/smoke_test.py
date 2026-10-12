"""Kiểm tra nhanh một site đã triển khai (chạy sau mỗi lần cài hoặc cập nhật).

  python3 tools/smoke_test.py --url https://sim.example.vn --user gv.lan --class-code NOISOI-K47
Mật khẩu giảng viên đọc từ biến ROBO_PW hoặc hỏi khi chạy. Không ghi đánh giá giả vào CSDL;
chỉ tạo một buổi mô phỏng thử với mã học viên SMOKE-TEST.
"""
import argparse
import base64
import getpass
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

FAIL = []
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def demo_log(sid, role="stu"):
    """Nhật ký một buổi thực hành làm đúng toàn bộ (học viên giữ vai `role`, ê kíp ảo làm các vai khác),
    sinh bằng bộ chấm Python giống hệt cách trình duyệt ghi nhật ký."""
    from simcore import load_all
    from simcore.session import Session, area_center
    sc = load_all(Path(__file__).resolve().parents[1] / "scenarios")[sid]
    ses, t = Session(sc, None, role, "SMOKE-TEST"), 0.0
    for _ in range(1000):
        t += 0.01
        r = ses.bot(t)
        if ses.result is not None:
            break
        if r.get("idle"):
            ready = ses.student_available()
            if not ready:
                break
            st = sc.step(ready[0])
            e = ses.engine
            target = st.target
            if st.targets:
                target = next(x for x in st.targets if x not in e.partial.get(st.id, set()))
            if st.decision:
                target = e.correct_answer(st)
            data = {}
            if st.min_duration_s:
                data["duration_s"] = st.min_duration_s + 30
            if st.area:
                data["point"] = area_center(st.area)
            ses.do(role, st.action, target, data, t)
    return ses.log, t


def req(base, path, method="GET", body=None, headers=None, ctx=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"} if data else {}
    h.update(headers or {})
    r = urllib.request.Request(base + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=15, context=ctx) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  LỖI  ") + name + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        FAIL.append(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--class-code", default="")
    ap.add_argument("--cacert", help="chứng chỉ CA riêng (bản LAN dùng tls internal)")
    ap.add_argument("--lan", action="store_true", help="bản LAN: không kiểm tra HSTS")
    a = ap.parse_args()
    base = a.url.rstrip("/")
    ctx = ssl.create_default_context(cafile=a.cacert) if a.cacert else None
    pw = os.environ.get("ROBO_PW") or getpass.getpass(f"Mật khẩu {a.user}: ")
    auth = {"Authorization": "Basic " + base64.b64encode(f"{a.user}:{pw}".encode()).decode()}

    print(f"Kiểm tra {base}")
    s, h, b = req(base, "/health", ctx=ctx)
    check("/health trả ok", s == 200 and json.loads(b).get("ok"), f"{s} {b[:120]!r}")
    s, h, _ = req(base, "/sim", ctx=ctx)
    check("trang sinh viên /sim mở được", s == 200, str(s))
    check("có header bảo mật", h.get("x-content-type-options") == "nosniff" and "referrer-policy" in h)
    if base.startswith("https://") and not a.lan:
        check("có HSTS", "strict-transport-security" in h)
    s, _, b = req(base, "/api/scenarios", ctx=ctx)
    sc = json.loads(b) if s == 200 else []
    check("danh sách kịch bản", s == 200 and len(sc) >= 1, str(s))
    s, _, _ = req(base, "/static/sim/three.min.js", ctx=ctx)
    check("thư viện 3D tải được", s == 200, str(s))
    s, _, _ = req(base, "/", ctx=ctx)
    check("trang giảng viên đòi đăng nhập (401)", s == 401, str(s))
    s, _, _ = req(base, "/", headers=auth, ctx=ctx)
    check("đăng nhập giảng viên thành công", s == 200, f"{s}: sai tên hoặc mật khẩu?")
    s, _, _ = req(base, "/docs", ctx=ctx)
    check("tài liệu API đã ẩn", s == 404, str(s))

    body = {"scenario_id": "m2_sterile_basics", "learner": "SMOKE-TEST", "role": "stu", "class_code": a.class_code}
    s, _, b = req(base, "/api/run/start", "POST", body, ctx=ctx)
    check("bắt đầu buổi mô phỏng bằng mã lớp", s == 200, f"{s} {b[:150]!r}")
    if s == 200:
        st = json.loads(b)
        log, t_end = demo_log("m2_sterile_basics", "stu")
        s, _, b = req(base, "/api/results", "POST", {"token": st["token"], "log": log, "t_end": t_end}, ctx=ctx)
        check("máy chủ chấm lại nhật ký và lưu điểm", s == 200 and json.loads(b)["result"]["score"] == 100, f"{s} {b[:150]!r}")
        s, _, b = req(base, "/api/sessions", headers=auth, ctx=ctx)
        check("giảng viên thấy buổi vừa chạy", s == 200 and b"SMOKE-TEST" in b, str(s))

    print("\nKẾT QUẢ: " + ("đạt" if not FAIL else f"{len(FAIL)} mục lỗi"))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
