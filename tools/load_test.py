"""Thử tải: N sinh viên cùng bắt đầu và nộp kết quả (bản 0.6: buổi chạy trong trình duyệt, máy chủ chỉ
cấp token và chấm lại nhật ký, nên mỗi buổi chỉ tạo 2 yêu cầu lên máy chủ).

  python3 tools/load_test.py --url https://sim.example.vn --class-code NOISOI-K47 --students 100
Mỗi sinh viên ảo để lại một buổi mã LOAD-xx trong CSDL; chạy ngoài giờ học.
"""
import argparse
import json
import ssl
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_test import demo_log  # noqa: E402

LAT, ERR = [], []
LOCK = threading.Lock()


def call(url, body, ctx):
    r = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(r, timeout=60, context=ctx) as resp:
            out = json.loads(resp.read())
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        out = None
        with LOCK:
            ERR.append(str(e))
    with LOCK:
        LAT.append(time.perf_counter() - t)
    return out


def student(i, a, ctx, log, t_end, barrier):
    barrier.wait()
    st = call(a.url + "/api/run/start", {"scenario_id": a.scenario, "learner": f"LOAD-{i:03d}", "role": a.role, "class_code": a.class_code}, ctx)
    if st:
        call(a.url + "/api/results", {"token": st["token"], "log": log, "t_end": t_end}, ctx)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--class-code", default="")
    ap.add_argument("--students", type=int, default=60)
    ap.add_argument("--scenario", default="m5_lap_appendectomy_ntp")
    ap.add_argument("--role", default="asst")
    ap.add_argument("--cacert")
    a = ap.parse_args()
    a.url = a.url.rstrip("/")
    ctx = ssl.create_default_context(cafile=a.cacert) if a.cacert else None
    log, t_end = demo_log(a.scenario, a.role)
    barrier = threading.Barrier(a.students)
    t0 = time.perf_counter()
    th = [threading.Thread(target=student, args=(i, a, ctx, log, t_end, barrier)) for i in range(a.students)]
    for t in th:
        t.start()
    for t in th:
        t.join()
    dur = time.perf_counter() - t0
    lat = sorted(LAT)
    print(f"{a.students} sinh viên ảo nộp cùng lúc: {len(lat)} yêu cầu trong {dur:.1f} s")
    print(f"Độ trễ: trung vị {statistics.median(lat)*1000:.0f} ms, p95 {lat[int(.95*(len(lat)-1))]*1000:.0f} ms, lớn nhất {lat[-1]*1000:.0f} ms")
    print(f"Lỗi: {len(ERR)}" + (f"  ví dụ: {ERR[0]}" if ERR else ""))


if __name__ == "__main__":
    main()
