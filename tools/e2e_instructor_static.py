"""Kiểm thử đầu cuối bảng điều khiển giảng viên BẢN TĨNH (như GitHub Pages) bằng Chromium thật.

  python3 tools/build_static.py --out site_root/robo-or-sim
  python3 -m http.server -d site_root 8090
  python3 tools/e2e_instructor_static.py --url http://127.0.0.1:8090/robo-or-sim/ --files a.json b.json ...

Kiểm tra: nhập tệp kết quả, nhập trùng, tệp bị sửa bị từ chối, số liệu trên bảng điều khiển, trang chi tiết,
lưu phiếu đánh giá, xuất CSV, xuất/xoá/nhập sao lưu, gắn và xuất mốc video, không có lỗi JavaScript.
"""
import argparse
import csv
import io
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

FAIL = []


def check(name, cond, detail=""):
    print(("  OK   " if cond else "  LỖI  ") + name + (f"  ({detail})" if detail and not cond else ""), flush=True)
    if not cond:
        FAIL.append(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--files", nargs="+", required=True)
    a = ap.parse_args()
    gv = a.url.rstrip("/") + "/giang-vien/"
    files = [Path(f) for f in a.files]
    tmp = Path(tempfile.mkdtemp())
    bad = tmp / "bi-sua.json"
    d = json.loads(files[0].read_text(encoding="utf-8"))
    d["log"][0]["t"] = -5
    bad.write_text(json.dumps(d), encoding="utf-8")

    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(accept_downloads=True, viewport={"width": 1366, "height": 900})
        pg = ctx.new_page()
        js_errors = []
        pg.on("pageerror", lambda e: js_errors.append(str(e)))
        pg.on("console", lambda m: js_errors.append(m.text) if m.type == "error" else None)

        print(f"Bảng điều khiển: {gv}")
        pg.goto(gv)
        pg.wait_for_selector(".static-note")
        check("có thông báo bản tĩnh và nút sao lưu", "Xuất sao lưu" in pg.inner_text(".static-note"))
        pg.wait_for_function("document.getElementById('sN').textContent !== '–'")
        check("ban đầu chưa có buổi", pg.inner_text("#sN") == "0" and "Chưa có buổi nào" in pg.inner_text("#sessions"))

        pg.set_input_files("#impFile", [str(f) for f in files])
        pg.wait_for_function("document.getElementById('impMsg').textContent.startsWith('Đã nhập')", timeout=30000)
        check(f"nhập {len(files)} tệp", pg.inner_text("#impMsg").startswith(f"Đã nhập {len(files)} tệp"), pg.inner_text("#impMsg"))
        pg.wait_for_function(f"document.getElementById('sN').textContent === '{len(files)}'", timeout=15000)
        rows = pg.locator("#sessions table tr").count()
        check("bảng các buổi có đủ dòng", rows == 1 + 2 * len(files), str(rows))

        pg.set_input_files("#impFile", [str(files[0]), str(bad)])
        pg.wait_for_function("document.getElementById('impMsg').textContent.includes('Lỗi') || document.getElementById('impMsg').textContent.includes('đã có')", timeout=30000)
        m = pg.inner_text("#impMsg")
        check("nhập lại tệp cũ không tạo buổi trùng", "1 tệp đã có từ trước" in m, m)
        check("tệp bị sửa bị từ chối", "bi-sua.json" in m and "không hợp lệ" in m, m)
        check("số buổi giữ nguyên", pg.inner_text("#sN") == str(len(files)))
        stats = {k: pg.inner_text(f"#{k}") for k in ("sN", "sF", "sP", "sM", "sQ", "sA")}
        print("   số liệu:", stats)

        # chi tiết + phiếu đánh giá
        pg.locator("#sessions a.row-btn").first.click()
        pg.wait_for_function("document.getElementById('title').textContent !== 'Đang tải…'", timeout=15000)
        check("trang chi tiết mở được", "session.html?reg=local-" in pg.url and pg.locator("#steps table tr").count() > 3, pg.url)
        check("có dòng thời gian và giai đoạn", pg.locator("#timeline li").count() > 0 and pg.locator("#phases .phbar").count() > 0)
        pg.fill("#assessor", "GV Lan")
        for name in pg.eval_on_selector_all("#rubric .rate input[value='4']", "xs => xs.map(x => x.id)"):
            pg.click(f"label[for='{name}']")
        pg.select_option("#overall", "dat")
        pg.fill("#comment", "Đứng đúng vị trí, cần nhanh hơn ở bước hút dịch.")
        pg.click("#form button[type=submit]")
        pg.wait_for_function("document.getElementById('saved').textContent.length > 0")
        check("lưu phiếu đánh giá", pg.inner_text("#saved") == "Đã lưu.", pg.inner_text("#saved"))
        check("phiếu hiện lại trên trang", "GV Lan" in pg.inner_text("#prev") and "TB 4" in pg.inner_text("#prev"))
        pg.click("text=← Bảng điều khiển")
        pg.wait_for_function("document.getElementById('sA').textContent === '1'", timeout=15000)
        check("bảng điều khiển ghi nhận 1 buổi đã chấm", "Đạt (GV Lan)" in pg.inner_text("#sessions"))

        # xuất CSV
        with pg.expect_download() as dl:
            pg.click("text=Xuất CSV (mở bằng Excel)")
        text = Path(dl.value.path()).read_text(encoding="utf-8-sig")
        rows = list(csv.reader(io.StringIO(text)))
        check("CSV có tiêu đề + đủ buổi", len(rows) == 1 + len(files) and rows[0][0] == "registration", str(len(rows)))
        check("CSV có phiếu đánh giá", any(r[13] == "GV Lan" and r[14] == "dat" and r[15] == "4.0" for r in rows[1:]))

        # sao lưu: xuất, xoá, nhập lại
        with pg.expect_download() as dl:
            pg.click(".static-note button:has-text(\"Xuất sao lưu\")")
        backup = Path(dl.value.path())
        pg.once("dialog", lambda dlg: dlg.accept())
        pg.click(".static-note button:has-text(\"Xoá dữ liệu\")")
        pg.wait_for_function("document.getElementById('sN').textContent === '0'", timeout=15000)
        check("xoá dữ liệu", True)
        pg.set_input_files(".static-note input[type=file]", str(backup))
        pg.wait_for_function(f"document.getElementById('sN').textContent === '{len(files)}'", timeout=30000)
        check("nhập sao lưu khôi phục đủ buổi và phiếu", pg.inner_text("#sA") == "1", pg.inner_text(".static-note"))
        pg.reload()
        pg.wait_for_function(f"document.getElementById('sN').textContent === '{len(files)}'", timeout=15000)
        check("dữ liệu còn sau khi tải lại trang", True)
        after = {k: pg.inner_text(f"#{k}") for k in stats}
        check("số liệu sau khôi phục giống trước (trừ số buổi đã chấm)", {**after, "sA": "0"} == stats, str(after))

        # mốc video
        pg.goto(gv + "video-markers.html")
        pg.wait_for_function("document.querySelectorAll('#steps li.st').length > 5", timeout=30000)
        pg.locator("#steps li.st").nth(10).click()
        pg.fill("#start", "61.5"); pg.fill("#end", "75"); pg.fill("#author", "GV Lan")
        pg.click("#save")
        pg.wait_for_function("document.getElementById('msg').textContent.includes('Đã lưu')", timeout=10000)
        check("lưu mốc video", "Đã gắn 1/" in pg.inner_text("#progTxt"), pg.inner_text("#progTxt"))
        pg.fill("#start", "80"); pg.fill("#end", "70"); pg.click("#save")
        pg.wait_for_function("document.getElementById('msg').textContent.includes('Không lưu')", timeout=10000)
        check("mốc sai (cuối trước đầu) bị từ chối", "Cuối đoạn phải sau đầu đoạn" in pg.inner_text("#msg"), pg.inner_text("#msg"))
        with pg.expect_download() as dl:
            pg.click("#exp")
        mk = json.loads(Path(dl.value.path()).read_text(encoding="utf-8"))
        check("xuất mốc đúng định dạng dùng cho repo", mk.get("video") == "yt_lFUi_ozMJUc" and len(mk.get("markers", {})) == 1, str(mk)[:120])
        pg.reload()
        pg.wait_for_function("document.getElementById('progTxt').textContent.includes('Đã gắn 1/')", timeout=30000)
        check("mốc còn sau khi tải lại", True)

        noise = [e for e in js_errors if "youtube" not in e.lower() and "ERR_" not in e and "Failed to load resource" not in e]
        check("không có lỗi JavaScript", not noise, "; ".join(noise[:3]))
        br.close()
    print("\nKẾT QUẢ: " + ("đạt" if not FAIL else f"{len(FAIL)} mục lỗi"))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
