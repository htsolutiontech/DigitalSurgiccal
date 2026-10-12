"""Khóa ghi dùng chung cho SQLite (một bên ghi tại một thời điểm)."""
import threading

WRITE_LOCK = threading.Lock()
