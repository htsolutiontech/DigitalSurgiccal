"""Tạo dòng tài khoản giảng viên cho biến ROBO_INSTRUCTORS.

  python3 tools/hash_password.py --user nguyenvana
Nhập mật khẩu (không hiện trên màn hình), in ra:  nguyenvana=pbkdf2:600000:...
Nhiều tài khoản: nối các dòng bằng dấu chấm phẩy.
"""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.settings import hash_password  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True, help="tên đăng nhập, không dấu, không khoảng trắng")
    ap.add_argument("--password-stdin", action="store_true", help="đọc mật khẩu từ stdin (dùng trong script)")
    a = ap.parse_args()
    if any(c in a.user for c in "=;: ") or not a.user.isascii():
        sys.exit("Tên đăng nhập không được chứa dấu tiếng Việt, khoảng trắng, '=', ';' hoặc ':'")
    if a.password_stdin:
        pw = sys.stdin.readline().rstrip("\n")
    else:
        pw = getpass.getpass("Mật khẩu: ")
        if pw != getpass.getpass("Nhập lại: "):
            sys.exit("Hai lần nhập không khớp")
    if len(pw) < 12:
        sys.exit("Mật khẩu cần ít nhất 12 ký tự")
    print(f"{a.user}={hash_password(pw)}")


if __name__ == "__main__":
    main()
