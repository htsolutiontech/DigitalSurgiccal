"""Kiểm thử đầu cuối bằng trình duyệt thật (Chromium qua Playwright): sinh viên làm buổi thực hành module 5
vai phụ mổ bằng chính giao diện, cả bản tĩnh (GitHub Pages) và bản có máy chủ (Vercel/VPS).

  pip install playwright && playwright install chromium
  python3 tools/e2e_browser.py --static http://127.0.0.1:8090/robo-or-sim/
  python3 tools/e2e_browser.py --server http://127.0.0.1:8000/ --user gv.lan --class-code NOISOI-K47 --import-file ket-qua.json
Mật khẩu giảng viên đọc từ biến ROBO_PW.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
M5 = json.loads((ROOT / "scenarios" / "m5_lap_appendectomy_ntp.json").read_text(encoding="utf-8"))
STEP_BY_TITLE = {s["title"]: s for s in M5["steps"]}


def log(msg):
    print(msg, flush=True)


def practice_m5(page, url, learner, timeout=240):
    page.goto(url)
    page.wait_for_function("document.querySelectorAll('#scenario option').length >= 4")
    page.click("#modeSeg button[data-v=practice]")
    page.select_option("#scenario", "m5_lap_appendectomy_ntp")
    page.select_option("#role", "asst")
    page.select_option("#caseSel", "A")
    page.fill("#learner", learner)
    page.click("#startBtn")
    page.wait_for_selector("#showHints", state="visible")
    page.check("#showHints")
    clicked, t0 = set(), time.time()
    while time.time() - t0 < timeout:
        if page.locator("#quiz[open]").count():
            for q in M5["quiz"]:
                page.check(f"input[name='{q['id']}'][value='{q['answer'] if q['id'] != 'q1' else (q['answer'] + 1) % len(q['options'])}']")
            page.click("#quizSubmit")
            break
        b = page.locator("#banner").inner_text() if page.locator("#banner").is_visible() else ""
        if b.startswith("Đến lượt bạn: "):
            for title in b[len("Đến lượt bạn: "):].split("; "):
                st = STEP_BY_TITLE.get(title)
                if not st or st["id"] in clicked:
                    continue
                btn = page.locator("#palette button", has_text=title).first
                if not btn.count():
                    continue
                btn.dispatch_event("click")   # bảng thao tác dựng lại mỗi nhịp ê kíp ảo
                if st.get("area"):
                    a = st["area"]
                    page.evaluate("p => SIM.onPick({kind:'floor', point:p})", [(a[0] + a[2]) / 2, 0, (a[1] + a[3]) / 2])
                clicked.add(st["id"])
                log(f"   sinh viên làm: {title}")
                break
        time.sleep(0.25)
    page.wait_for_selector("#result[open]", timeout=30000)
    return {"title": page.inner_text("#resTitle"), "score": page.inner_text("#resScore"),
            "official": page.inner_text("#resOfficial"), "quiz": page.inner_text("#resQuiz"), "clicked": sorted(clicked)}


def demo_m3(page, url):
    page.goto(url)
    page.wait_for_function("document.querySelectorAll('#scenario option').length >= 4")
    page.select_option("#scenario", "m3_safety_checklist")
    page.click("#speedSeg button[data-v='2']")
    page.click("#startBtn")
    page.wait_for_selector("#result[open]", timeout=120000)
    return page.inner_text("#resTitle"), page.inner_text("#resScore")


def one_student(url, learner):
    """Một sinh viên làm buổi thực hành module 5 qua giao diện (dùng trong tools/e2e_live.py, chạy song song)."""
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        page = br.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        r = practice_m5(page, url, learner, timeout=600)
        log(f"[{learner}] {r['title']} | {r['score']} | {r['official']}")
        ok = "chính thức" in r["official"] and not errors
        log("KẾT QUẢ: " + ("đạt" if ok else f"lỗi {errors[:2]}"))
        br.close()
        sys.exit(0 if ok else 1)


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--one-student":
        one_student(sys.argv[2], sys.argv[3])
    ap = argparse.ArgumentParser()
    ap.add_argument("--static")
    ap.add_argument("--server")
    ap.add_argument("--user", default="gv.lan")
    ap.add_argument("--class-code", default="")
    ap.add_argument("--import-file", help="tệp kết quả (từ bản tĩnh) để thử nhập vào bảng điều khiển")
    ap.add_argument("--save", default="ket-qua-e2e.json")
    a = ap.parse_args()
    fails = []
    with sync_playwright() as p:
        br = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        errors = []
        if a.static:
            ctx = br.new_context(accept_downloads=True)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(a.static)
            page.wait_for_function("document.querySelectorAll('#scenario option').length >= 4")
            note = page.inner_text("#serverNote")
            log(f"[tĩnh] ghi chú: {note[:80]}")
            if "tự luyện" not in note or page.locator(".navlink").is_visible():
                fails.append("bản tĩnh: không nhận ra chế độ tự luyện")
            t, s = demo_m3(page, a.static)
            log(f"[tĩnh] thị phạm m3: {t} | {s}")
            if "100" not in s:
                fails.append("bản tĩnh: thị phạm không đạt 100")
            page.locator("#resClose").click()
            r = practice_m5(page, a.static, "SV-TINH")
            log(f"[tĩnh] thực hành m5: {r['title']} | {r['score']} | {r['official']} | {r['quiz'][:60]}")
            if not r["score"].startswith("100") or "tự luyện" not in r["official"] or "4/5" not in r["quiz"]:
                fails.append("bản tĩnh: kết quả thực hành sai")
            with page.expect_download() as dl:
                page.click("#resDownload")
            dl.value.save_as(a.save)
            f = json.loads(Path(a.save).read_text(encoding="utf-8"))
            log(f"[tĩnh] tệp kết quả: {len(f['log'])} thao tác, {f['client_result']['score']} điểm -> {a.save}")
            ctx.close()
        if a.server:
            pw = os.environ.get("ROBO_PW", "")
            ctx = br.new_context(http_credentials={"username": a.user, "password": pw})
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(str(e)))
            base = a.server.rstrip("/") + "/"
            # sai mã lớp
            page.goto(base + "sim?class=SAI")
            page.wait_for_function("document.querySelectorAll('#scenario option').length >= 4")
            page.click("#modeSeg button[data-v=practice]")
            page.fill("#learner", "SV-X")
            page.click("#startBtn")
            page.wait_for_selector("#toast div.bad", timeout=5000)
            log(f"[máy chủ] sai mã lớp: {page.inner_text('#toast div.bad')[:70]}")
            r = practice_m5(page, f"{base}sim?class={a.class_code}", "SV-MAYCHU")
            log(f"[máy chủ] thực hành m5: {r['title']} | {r['score']} | {r['official']} | {r['quiz'][:60]}")
            if not r["score"].startswith("100") or "chính thức" not in r["official"] or "4/5" not in r["quiz"]:
                fails.append("máy chủ: kết quả thực hành sai")
            if not page.locator("#resReport").is_visible():
                fails.append("máy chủ: thiếu liên kết báo cáo chi tiết")
            if a.import_file:
                page.goto(base)
                page.set_input_files("#impFile", a.import_file)
                page.wait_for_function("document.getElementById('impMsg').textContent.length > 0", timeout=15000)
                m = page.inner_text("#impMsg")
                log(f"[máy chủ] nhập tệp kết quả: {m}")
                if "Đã nhập 1 tệp." != m.strip():
                    fails.append("máy chủ: nhập tệp kết quả lỗi")
                page.wait_for_function("document.body.innerText.includes('SV-TINH')", timeout=15000)
            ctx.close()
        br.close()
    real_errors = [e for e in errors if "YT" not in e and "youtube" not in e.lower()]
    if real_errors:
        fails.append("lỗi JavaScript: " + "; ".join(real_errors[:3]))
    log("KẾT QUẢ: " + ("đạt" if not fails else "LỖI: " + " | ".join(fails)))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
