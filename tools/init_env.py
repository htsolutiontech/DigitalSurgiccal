"""Tạo tệp .env cho máy chủ (hỏi từng mục, tự sinh token ngẫu nhiên). Quyền tệp 600.

  python3 tools/init_env.py              # tạo .env cho Docker Compose (tên miền công khai)
  python3 tools/init_env.py --lan        # mạng nội bộ của trường
  python3 tools/init_env.py --out /etc/robo-or-sim.env --no-domain   # cài systemd
"""
import argparse
import getpass
import os
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.settings import hash_password  # noqa: E402


def ask(q, default=""):
    v = input(f"{q}{f' [{default}]' if default else ''}: ").strip()
    return v or default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".env")
    ap.add_argument("--no-domain", action="store_true", help="không hỏi DOMAIN/ACME_EMAIL (cài Nginx)")
    ap.add_argument("--lan", action="store_true", help="mạng nội bộ: DOMAIN là IP/tên nội bộ, không cần email")
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists() and ask(f"{out} đã có. Ghi đè? (y/N)", "N").lower() != "y":
        sys.exit("Giữ nguyên tệp cũ.")
    lines = []
    if a.lan:
        lines += [f"DOMAIN={ask('IP hoặc tên nội bộ của máy chủ (vd 192.168.1.10)')}", "ACME_EMAIL=khong-dung@localhost"]
    elif not a.no_domain:
        lines += [f"DOMAIN={ask('Tên miền (vd sim.truongyhue.edu.vn)')}", f"ACME_EMAIL={ask('Email nhận thông báo chứng chỉ')}"]
    users = []
    while True:
        u = ask("Tên đăng nhập giảng viên (Enter để kết thúc)" if users else "Tên đăng nhập giảng viên đầu tiên")
        if not u:
            if users:
                break
            continue
        if any(c in u for c in "=;: ") or not u.isascii():
            print("  Không dấu, không khoảng trắng, không '=', ';', ':'")
            continue
        pw = getpass.getpass("  Mật khẩu (>= 12 ký tự): ")
        if len(pw) < 12 or pw != getpass.getpass("  Nhập lại: "):
            print("  Mật khẩu quá ngắn hoặc không khớp, nhập lại.")
            continue
        users.append(f"{u}={hash_password(pw)}")
    code = ask("Mã lớp cho sinh viên", f"LOP-{secrets.token_hex(3).upper()}")
    lines += [f"ROBO_INSTRUCTORS={';'.join(users)}", f"ROBO_CLASS_CODE={code}",
              f"ROBO_TOKEN={secrets.token_urlsafe(32)}", "ROBO_CSP_ENFORCE=0"]
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(out, 0o600)
    print(f"Đã ghi {out} (quyền 600). Mã lớp: {code}")


if __name__ == "__main__":
    main()
