#!/usr/bin/env bash
# Sao lưu CSDL khi chạy bằng Docker. Đặt lịch hằng ngày bằng cron trên máy chủ:
#   30 2 * * * cd /opt/robo-or-sim && ./deploy/backup.sh >> /var/log/robo-or-sim-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
docker compose exec -T app python tools/backup_db.py --out /data/backups --keep-days 30
# Sao bản sao lưu ra thư mục ./backups trên máy chủ (để chép tiếp sang nơi khác)
docker compose cp app:/data/backups/. ./backups/
# Giữ 30 ngày trên máy chủ
find ./backups -name 'robo_or_sim_*.db' -mtime +30 -delete
echo "$(date '+%F %T') sao lưu xong: $(ls -1 backups | tail -1)"
