"""Dựng bản TĨNH (không cần máy chủ) để đăng lên GitHub Pages hoặc bất kỳ nơi lưu trang tĩnh nào.

  python3 tools/build_static.py --out site
  python3 -m http.server -d site 8080        # xem thử: http://localhost:8080

Bản tĩnh có đủ mô phỏng 3D, thị phạm, thực hành, chấm điểm, câu hỏi kiến thức, video theo bước.
Bảng điều khiển giảng viên bản tĩnh ở /giang-vien/: sinh viên tải "tệp kết quả" để nộp; giảng viên nhập tệp,
trình duyệt chấm lại từ nhật ký thao tác (local_reports.js), phiếu đánh giá lưu trong trình duyệt của giảng viên.
Không có: đăng nhập, dữ liệu chung giữa các máy, theo dõi trực tiếp (cần bản Vercel/VPS).

Mốc video: giảng viên xuất từ trang /video-markers (bản có máy chủ), lưu vào media/markers/<kịch bản>__<video>.json.
"""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


# Trang giảng viên bản tĩnh: cùng HTML/JS với bản máy chủ, thêm local_api.js thay cho /api (xem tệp đó)
INSTRUCTOR_PAGES = {"dashboard.html": "index.html", "session.html": "session.html", "video_markers.html": "video-markers.html"}
LINKS = [('href="/api/export.csv"', 'href="api/export.csv"'), ('href="/sim"', 'href="../"'), ('href="/video-markers"', 'href="video-markers.html"'), ('href="/live"', 'href="#"'), ('href="/"', 'href="index.html"')]


def build_instructor_pages(out: Path) -> None:
    gv = out / "giang-vien"
    gv.mkdir()
    shutil.copytree(ROOT / "backend" / "static" / "js", out / "static" / "js")
    inject = ('<script>window.ROBO_STATIC=true;</script>\n<script src="../static/sim/engine.js"></script>\n'
              '<script src="../static/js/local_reports.js"></script>\n<script src="../static/js/local_api.js"></script>\n')
    for src, dst in INSTRUCTOR_PAGES.items():
        html = (ROOT / "backend" / "static" / src).read_text(encoding="utf-8")
        for a, b in LINKS:
            html = html.replace(a, b)
        page_js = f'<script src="/static/js/{src.replace(".html", ".js")}"></script>'
        assert page_js in html, f"{src}: không thấy {page_js}"
        html = html.replace(page_js, inject + page_js.replace('src="/static/', 'src="../static/'))
        assert 'src="/' not in html and 'href="/' not in html, f"{src}: còn đường dẫn tuyệt đối"
        html = html.replace("<head>", '<head>\n<meta name="robots" content="noindex">', 1)
        (gv / dst).write_text(html, encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="site")
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        shutil.rmtree(out)
    (out / "data" / "media").mkdir(parents=True)
    shutil.copytree(ROOT / "backend" / "static" / "sim", out / "static" / "sim")
    shutil.copy(ROOT / "backend" / "static" / "sim" / "index.html", out / "index.html")
    (out / ".nojekyll").write_text("")
    build_instructor_pages(out)

    raws = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((ROOT / "scenarios").glob("*.json"))]
    # bản tự luyện chấm câu hỏi kiến thức ngay trên máy nên kèm đáp án
    (out / "data" / "scenarios.json").write_text(json.dumps(raws, ensure_ascii=False), encoding="utf-8")

    catalog = json.loads((ROOT / "media" / "videos.json").read_text(encoding="utf-8"))
    n_mark = 0
    for raw in raws:
        sid, items = raw["id"], []
        for v in catalog.get(sid, []):
            f = ROOT / "media" / "markers" / f"{sid}__{v['key']}.json"
            m = json.loads(f.read_text(encoding="utf-8")).get("markers", {}) if f.exists() else {}
            n_mark += len(m)
            items.append({**v, "markers": m, "marked_steps": len(m), "total_steps": len(raw["steps"])})
        (out / "data" / "media" / f"{sid}.json").write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"Đã dựng bản tĩnh vào {out}/ ({len(raws)} kịch bản, {n_mark} mốc video, {size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
