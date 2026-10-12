"""Kiểm thử SONG SONG sinh viên + giảng viên trên bản có máy chủ (Vercel/VPS), bằng Chromium thật.

- K sinh viên làm buổi thực hành module 5 qua giao diện (mỗi người một trình duyệt, chạy cùng lúc);
- N sinh viên ảo gửi tiến độ qua API (có người mắc lỗi nghiêm trọng, có người bỏ dở);
- giảng viên mở trang Theo dõi trực tiếp và phải thấy: số đang làm, tiến độ tăng dần, lỗi nghiêm trọng được
  đưa lên đầu, buổi bỏ dở chuyển "Tạm dừng", buổi nộp xong chuyển "Đã nộp" kèm điểm, rồi xem chi tiết được.

  ROBO_PW=... python3 tools/e2e_live.py --server http://127.0.0.1:8000/ --user gv.lan --class-code NOISOI-K47 --ui 2 --api 20
"""
import argparse
import json
import os
import random
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from simcore import load_all  # noqa: E402
from simcore.session import Session, area_center  # noqa: E402

SC = load_all(ROOT / "scenarios")
M5 = "m5_lap_appendectomy_ntp"
FAIL = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  LỖI  ") + name + (f"  ({detail})" if detail and not cond else ""), flush=True)
    if not cond:
        FAIL.append(name)


def post(base, path, body):
    r = urllib.request.Request(base + path, data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.loads(resp.read())


def api_student(base, code, i, kind, stop):
    """kind: 'good' làm đúng; 'critical' mắc lỗi nghiêm trọng; 'quit' bỏ dở giữa chừng."""
    learner = f"API-{kind}-{i:02d}"
    # lỗi nghiêm trọng (chạm vùng vô khuẩn) chỉ có ở kịch bản có vùng vô khuẩn: module 2, vai sinh viên dự mổ
    sid, role, case = ("m2_sterile_basics", "stu", None) if kind == "critical" else (M5, "asst", "A")
    st = post(base, "api/run/start", {"scenario_id": sid, "learner": learner, "role": role, "case_id": case, "class_code": code})
    sc, t0 = SC[sid], time.time()
    s = Session(sc, case, role, learner)
    now = lambda: round(time.time() - t0, 2)  # noqa: E731
    rng, sent_crit, steps = random.Random(i), False, 0
    while not stop.is_set() and s.result is None:
        r = s.bot(now())
        if r.get("idle"):
            ready = s.student_available()
            if kind == "critical" and not sent_crit and steps >= 1:
                z = sc.zones[0]                           # tay không vô khuẩn chạm vào vùng vô khuẩn: lỗi nghiêm trọng
                s.do(role, "contact", None, {"point": [(z.min[k] + z.max[k]) / 2 for k in range(3)], "is_sterile": False}, now())
                sent_crit = True
            elif ready:
                stp = sc.step(ready[0])
                data = {"point": area_center(stp.area)} if stp.area else {}
                if stp.min_duration_s:
                    data["duration_s"] = stp.min_duration_s + 30
                s.do(role, stp.action, stp.target, data, now())
                steps += 1
            post(base, "api/run/progress", {"token": st["token"], "log": s.log})
            if kind == "quit" and steps >= 2:
                return st["registration"], learner, None          # đóng trang, không gửi gì nữa
            stop.wait(2.5 + rng.random())
    if s.result is None:
        return st["registration"], learner, None
    r = post(base, "api/results", {"token": st["token"], "log": s.log, "t_end": s.last_t})
    return st["registration"], learner, r["result"]


def live_rows(page):
    return page.evaluate("""() => [...document.querySelectorAll('#list tr')].slice(1).map(tr => ({
        who: tr.querySelector('.who')?.textContent, status: tr.querySelector('.pill')?.textContent,
        crit: tr.classList.contains('crit'), cells: [...tr.children].map(td => td.innerText)}))""")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", required=True)
    ap.add_argument("--user", required=True)
    ap.add_argument("--class-code", default="")
    ap.add_argument("--ui", type=int, default=2)
    ap.add_argument("--api", type=int, default=20)
    a = ap.parse_args()
    base = a.server.rstrip("/") + "/"
    pw = os.environ["ROBO_PW"]
    stop = threading.Event()

    with sync_playwright() as p:
        br = p.chromium.launch()
        gv = br.new_context(http_credentials={"username": a.user, "password": pw}, viewport={"width": 1400, "height": 900})
        page = gv.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(base + "live")
        page.wait_for_selector("#nActive")
        page.wait_for_function("document.getElementById('nActive').textContent !== '–'")
        check("giảng viên mở được trang Theo dõi trực tiếp", True)

        # sinh viên giao diện: mỗi người một tiến trình, một trình duyệt, chạy cùng lúc
        ui = [subprocess.Popen([sys.executable, str(ROOT / "tools" / "e2e_browser.py"), "--one-student",
                                base + f"sim?class={a.class_code}", f"UI-{k}"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
              for k in range(a.ui)]
        kinds = ["critical"] * 2 + ["quit"] * 2 + ["good"] * (a.api - 4)
        res = {}
        th = [threading.Thread(target=lambda i=i, k=k: res.__setitem__(i, api_student(base, a.class_code, i, k, stop)))
              for i, k in enumerate(kinds)]
        for t in th:
            t.start()

        t0 = time.time()
        page.wait_for_function(f"+document.getElementById('nActive').textContent >= {a.api}", timeout=60000)
        check(f"thấy ≥ {a.api} buổi đang làm cùng lúc", True)
        page.wait_for_function("+document.getElementById('nCrit').textContent >= 2", timeout=90000)
        rows = live_rows(page)
        check("buổi có lỗi nghiêm trọng được đưa lên đầu, tô đỏ", rows[0]["crit"] and rows[1]["crit"] and "API-critical" in rows[0]["who"], str(rows[:2])[:200])
        page.wait_for_function("[...document.querySelectorAll('#list .who')].filter(x=>x.textContent.startsWith('UI-')).length >= " + str(a.ui), timeout=120000)
        def ui_done(r):
            for c in r["cells"]:
                if "/" in c and "bước" in c:
                    return int(c.split("/")[0])
            return 0
        first = {r["who"]: ui_done(r) for r in live_rows(page) if r["who"] and r["who"].startswith("UI-")}
        time.sleep(25)
        later = {r["who"]: ui_done(r) for r in live_rows(page) if r["who"] and r["who"].startswith("UI-")}
        check("tiến độ sinh viên giao diện tăng dần trên trang giảng viên", any(later.get(k, 0) > v for k, v in first.items()), f"{first} -> {later}")
        print("   ví dụ dòng:", " | ".join(live_rows(page)[0]["cells"])[:220])

        page.wait_for_function("[...document.querySelectorAll('#list tr.idle .who')].some(x=>x.textContent.startsWith('API-quit'))", timeout=120000)
        check("buổi bỏ dở chuyển 'Tạm dừng' sau 45 giây không có tín hiệu", True)

        outs = [u.communicate(timeout=900)[0] for u in ui]
        for k, o in enumerate(outs):
            check(f"sinh viên giao diện UI-{k} làm xong, máy chủ chấm", ui[k].returncode == 0 and "KẾT QUẢ: đạt" in o, o[-300:])
        for t in th:
            t.join(timeout=900)
        stop.set()
        page.wait_for_function("+document.getElementById('nDone').textContent >= " + str(a.ui + a.api - 2), timeout=60000)
        rows = live_rows(page)
        sub = [r for r in rows if r["status"] == "Đã nộp"]
        check("buổi nộp xong chuyển 'Đã nộp' kèm điểm", len(sub) >= a.ui + a.api - 2 and all("điểm" in " ".join(r["cells"]) for r in sub), str(len(sub)))
        page.locator("#list a", has_text="Chi tiết, chấm").first.click()
        page.wait_for_function("document.getElementById('title') && document.getElementById('title').textContent !== 'Đang tải…'", timeout=30000)
        check("từ trang theo dõi mở được chi tiết buổi để chấm", "/session?reg=" in page.url)
    print(f"   tổng thời gian {time.time() - t0:.0f} s; lỗi JS trang giảng viên: {errs[:2]}")
    check("không có lỗi JavaScript trên trang giảng viên", not errs)
    print("\nKẾT QUẢ: " + ("đạt" if not FAIL else f"{len(FAIL)} mục lỗi"))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
