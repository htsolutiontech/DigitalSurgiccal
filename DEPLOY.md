# Triển khai Robo OR Sim lên một site chạy thật

Tài liệu này hướng dẫn đưa hệ thống mô phỏng lên máy chủ để sinh viên và giảng viên dùng hằng ngày. Có ba cách triển khai; chọn **một**.

| Cách | Khi nào dùng | HTTPS | Độ khó |
|---|---|---|---|
| **A. Docker + Caddy, tên miền công khai** (khuyến nghị) | Sinh viên truy cập từ bất kỳ đâu (nhà, ký túc xá, bệnh viện thực tập) | Let's Encrypt, tự gia hạn | Thấp |
| **B. Docker + Caddy, mạng nội bộ của trường** | Chỉ dùng trong phòng máy hoặc skills lab; không có tên miền | Chứng chỉ nội bộ của Caddy; phải cài chứng chỉ gốc lên máy sinh viên | Trung bình |
| **C. Không dùng Docker: systemd + Nginx + certbot** | Bộ phận CNTT của trường bắt buộc dùng Nginx hoặc không cho cài Docker | Let's Encrypt qua certbot | Trung bình |

Cả ba cách chạy cùng một mã nguồn và cùng các biến cấu hình.

> **Cách đơn giản hơn, không cần máy chủ riêng:** GitHub Pages (bản tự luyện, miễn phí) và Vercel (bản đầy đủ có giảng viên). Xem [DEPLOY_SIMPLE.md](DEPLOY_SIMPLE.md).

---

## 1. Chuẩn bị máy chủ

**Cấu hình đề xuất** (dựa trên thử tải ở mục 12):

- Một VPS 2 vCPU, 2–4 GB RAM, 20 GB SSD, chạy Ubuntu 24.04 LTS (hoặc 22.04). Cấu hình này đủ cho vài lớp thực tập cùng lúc.
- Ứng dụng dùng khoảng 80 MB RAM khi có 150 buổi mô phỏng đồng thời.
- Băng thông: mỗi sinh viên tải khoảng 1 MB tài nguyên trang ở lần đầu. Video ca mổ phát trực tiếp từ YouTube nên không tốn băng thông của máy chủ.
- Nhà cung cấp: VPS đặt tại Việt Nam cho độ trễ thấp với sinh viên trong nước. Hệ thống chỉ lưu mã học viên ẩn danh, không có dữ liệu bệnh nhân (mục 11). Nếu trường có quy định riêng về nơi đặt máy chủ, theo quy định đó.

**Tên miền** (chỉ cách A và C): tạo bản ghi DNS loại `A`, ví dụ `sim.truongyhue.edu.vn`, trỏ về IP công khai của VPS. Kiểm tra bằng `dig +short sim.truongyhue.edu.vn`; kết quả phải là IP của VPS **trước khi** bật Caddy hoặc certbot, nếu không sẽ không cấp được chứng chỉ.

**Tường lửa** trên VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp      # HTTP/3, không bắt buộc
sudo ufw enable
```

Nếu nhà cung cấp VPS có tường lửa riêng (security group), mở các cổng tương tự ở đó.

**Cài Docker** (cách A, B):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # đăng xuất rồi đăng nhập lại
docker compose version            # cần bản 2.x trở lên
```

## 2. Đưa mã nguồn lên máy chủ

Từ máy của bạn:

```bash
scp robo-or-sim.zip user@IP_MAY_CHU:/tmp/
```

Trên máy chủ:

```bash
sudo apt install -y unzip
sudo mkdir -p /opt/robo-or-sim && sudo chown $USER /opt/robo-or-sim
cd /opt && unzip /tmp/robo-or-sim.zip      # tạo /opt/robo-or-sim
cd /opt/robo-or-sim
```

Nếu dùng Git nội bộ, thay bước này bằng `git clone`.

## 3. Tạo cấu hình `.env`

Cách nhanh nhất là chạy công cụ hỏi từng mục. Công cụ băm mật khẩu, tự sinh token và ghi tệp với quyền 600:

```bash
python3 tools/init_env.py          # cách A (tên miền công khai)
python3 tools/init_env.py --lan    # cách B (mạng nội bộ)
```

Hoặc chép `.env.example` thành `.env` rồi tự điền:

| Biến | Ý nghĩa |
|---|---|
| `DOMAIN` | Tên miền (cách A) hoặc IP/tên nội bộ (cách B), ví dụ `192.168.10.20` |
| `ACME_EMAIL` | Email nhận cảnh báo chứng chỉ; cách B để giá trị bất kỳ |
| `ROBO_INSTRUCTORS` | Tài khoản giảng viên `ten=pbkdf2:...`, nhiều tài khoản cách nhau bằng `;`. Tạo từng dòng bằng `python3 tools/hash_password.py --user ten_dang_nhap` |
| `ROBO_CLASS_CODE` | Mã lớp sinh viên nhập khi bắt đầu. Đổi theo từng đợt thực tập |
| `ROBO_TOKEN` | Token cho ứng dụng Unreal gửi kết quả (`Authorization: Bearer <token>`) |
| `ROBO_CSP_ENFORCE` | `0` khi mới cài; chuyển `1` sau khi kiểm tra ở mục 8 |
| `ROBO_MAX_RUNS` | Không bắt buộc. Số buổi mô phỏng giữ trong bộ nhớ, mặc định 400 |

Lưu ý khi điền tay:

- Không dùng ký tự `$` trong `.env`, vì Docker Compose sẽ hiểu sai.
- Tên đăng nhập không dấu, không khoảng trắng.
- Mật khẩu tối thiểu 12 ký tự.

Ở chế độ production, máy chủ **từ chối khởi động** nếu thiếu tài khoản giảng viên, thiếu token, hoặc mật khẩu chưa băm, và log ghi rõ thiếu mục nào. Thiết kế này để tránh vô tình mở trang giảng viên ra internet.

## 4. Cách A: Docker + Caddy với tên miền công khai

```bash
cd /opt/robo-or-sim
docker compose up -d --build
docker compose ps                 # app phải "healthy", caddy "running"
docker compose logs -f caddy      # chờ dòng "certificate obtained successfully", Ctrl+C để thoát
```

Mở `https://sim.truongyhue.edu.vn/sim` để kiểm tra. Sau đó làm tiếp mục 7.

Những gì cách A cung cấp:

- Caddy tự xin chứng chỉ Let's Encrypt, tự gia hạn và chuyển HTTP sang HTTPS.
- Bật HSTS và nén gzip/zstd.
- Giới hạn thân yêu cầu ở 2 MB.
- Ứng dụng chạy bằng người dùng không phải root (uid 10001) và không mở cổng ra ngoài; chỉ Caddy nhận kết nối.
- Dữ liệu nằm trong volume `robo_data` (`/data/robo_or_sim.db`) và không mất khi cập nhật hay khởi động lại container.

## 5. Cách B: mạng nội bộ của trường (không có tên miền)

1. Đặt IP tĩnh cho máy chủ trong mạng trường, ví dụ `192.168.10.20`.
2. Tạo cấu hình bằng `python3 tools/init_env.py --lan`.
3. Chạy:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
   ```

4. Lấy chứng chỉ gốc của Caddy để cài lên máy sinh viên:

   ```bash
   docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
   ```

5. Cài chứng chỉ này làm "Trusted Root" trên từng máy trong phòng máy:
   - Windows (quyền quản trị): `certutil -addstore -f ROOT caddy-root.crt`. Có thể đẩy hàng loạt qua Group Policy.
   - Firefox dùng kho chứng chỉ riêng. Bật `security.enterprise_roots.enabled = true` hoặc nhập chứng chỉ thủ công.
   - Điện thoại sinh viên: cài thủ công khá phiền. Nếu cần sinh viên dùng điện thoại, nên chọn cách A.

Chứng chỉ gốc nằm trong volume `caddy_data`. **Không xóa volume này**; xóa đi sẽ sinh chứng chỉ gốc mới và phải cài lại trên mọi máy.

Tại sao không chạy HTTP thường cho đơn giản: mật khẩu giảng viên gửi theo Basic auth sẽ đi qua mạng ở dạng đọc được.

## 6. Cách C: không dùng Docker (systemd + Nginx + certbot)

```bash
# 1. Gói hệ thống
sudo apt install -y python3-venv nginx certbot python3-certbot-nginx

# 2. Người dùng và thư mục
sudo useradd --system --home /var/lib/robo-or-sim --shell /usr/sbin/nologin robosim
sudo mkdir -p /var/lib/robo-or-sim/backups && sudo chown -R robosim:robosim /var/lib/robo-or-sim
cd /opt/robo-or-sim
sudo python3 -m venv .venv && sudo .venv/bin/pip install -r requirements.txt

# 3. Cấu hình (không cần DOMAIN/ACME_EMAIL, Nginx lo phần đó)
sudo python3 tools/init_env.py --out /etc/robo-or-sim.env --no-domain
sudo chown root:robosim /etc/robo-or-sim.env && sudo chmod 640 /etc/robo-or-sim.env

# 4. Dịch vụ và lịch sao lưu
sudo cp deploy/systemd/robo-or-sim*.service deploy/systemd/robo-or-sim-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now robo-or-sim robo-or-sim-backup.timer
curl -s http://127.0.0.1:8000/health

# 5. Nginx + HTTPS (sửa sim.example.vn trong tệp trước)
sudo cp deploy/nginx/robo-or-sim.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/robo-or-sim.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d sim.truongyhue.edu.vn --redirect -m email@truong.edu.vn --agree-tos
```

Ghi chú về cách C:

- Dịch vụ chỉ nghe trên `127.0.0.1:8000`, có giới hạn quyền ghi (`ProtectSystem=strict`, chỉ ghi được `/var/lib/robo-or-sim`) và tự khởi động lại khi lỗi.
- Log xem bằng `journalctl -u robo-or-sim -f`.

## 7. Kiểm tra sau khi triển khai và bàn giao

Chạy công cụ kiểm tra từ máy của bạn hoặc ngay trên máy chủ. Công cụ đọc mật khẩu khi chạy và không lưu lại:

```bash
python3 tools/smoke_test.py --url https://sim.truongyhue.edu.vn --user gv.lan --class-code NOISOI-K47
# cách B: thêm  --lan --cacert caddy-root.crt
```

Công cụ kiểm tra 12 mục:

- `/health` và trang sinh viên.
- Header bảo mật và HSTS.
- Kịch bản và thư viện 3D.
- Trang giảng viên đòi đăng nhập; đăng nhập đúng thì vào được.
- Tài liệu API đã ẩn.
- Sinh viên bắt đầu và kết thúc được một buổi.
- Giảng viên thấy buổi vừa chạy.

Phải ra `KẾT QUẢ: đạt`. Công cụ để lại một buổi thử có mã `SMOKE-TEST`.

Bàn giao cho người dùng:

| Ai | Địa chỉ | Cần gì |
|---|---|---|
| Sinh viên | `https://<tên-miền>/sim?class=<MÃ-LỚP>` (in thành mã QR dán ở phòng học) | Mã học viên ẩn danh, không nhập họ tên |
| Giảng viên | `https://<tên-miền>/` | Tài khoản trong `ROBO_INSTRUCTORS` |
| Giảng viên phụ trách video | `https://<tên-miền>/video-markers` | Gắn mốc thời gian video theo bước |
| Ứng dụng Unreal | `POST https://<tên-miền>/xapi/statements` | Header `Authorization: Bearer <ROBO_TOKEN>` và `X-Experience-API-Version: 1.0.3` |

Đăng nhập giảng viên dùng hộp thoại của trình duyệt (HTTP Basic). Basic auth **không có nút đăng xuất**: trên máy dùng chung, đóng hẳn trình duyệt sau khi dùng.

## 8. Bật chặn theo chính sách nội dung (CSP)

Mặc định máy chủ gửi CSP ở chế độ *Report-Only*: trình duyệt chỉ báo vi phạm chứ không chặn. Sau khi cài xong:

1. Mở `/sim`, chạy thử một buổi module 5 có phát video, rồi mở `/`, `/session` và `/video-markers`.
2. Mở Console của trình duyệt (F12). Kiểm tra không còn dòng `[Report Only] Refused to ...`.
3. Đặt `ROBO_CSP_ENFORCE=1` trong `.env`, chạy `docker compose up -d`, rồi kiểm tra lại video và mô phỏng 3D.

Nếu video không phát sau khi bật chặn, trả về `0` và gửi các dòng Console cho nhóm phát triển.

## 9. Vận hành hằng ngày

**Sao lưu.** Bản sao lưu dùng cơ chế backup của SQLite nên chạy được khi máy chủ đang hoạt động, kèm kiểm tra toàn vẹn và tự xóa bản cũ hơn 30 ngày.

- Cách A, B: đặt cron trên máy chủ:

  ```bash
  crontab -e
  30 2 * * * cd /opt/robo-or-sim && ./deploy/backup.sh >> /var/log/robo-or-sim-backup.log 2>&1
  ```

  Bản sao lưu nằm ở `/opt/robo-or-sim/backups/`.
- Cách C: timer `robo-or-sim-backup.timer` chạy lúc 02:30, lưu ở `/var/lib/robo-or-sim/backups/`.
- **Bắt buộc chép ra ngoài máy chủ** (máy khác, NAS của trường, ổ lưu trữ đám mây), ví dụ dùng `rsync` hoặc `rclone` hằng tuần. Bản sao lưu chỉ nằm trên cùng VPS thì mất cùng VPS.

**Khôi phục** (dừng ứng dụng trước). Công cụ tự giữ lại CSDL hiện tại thành tệp `.truoc_khoi_phuc_...` trước khi ghi đè.

```bash
# Cách A, B
docker compose stop app
docker compose run --rm -v "$PWD/backups:/restore:ro" app python tools/backup_db.py --restore /restore/robo_or_sim_YYYYMMDD_HHMMSS.db
docker compose start app

# Cách C
sudo systemctl stop robo-or-sim
sudo -u robosim /opt/robo-or-sim/.venv/bin/python tools/backup_db.py --db /var/lib/robo-or-sim/robo_or_sim.db --restore <tệp>
sudo systemctl start robo-or-sim
```

**Cập nhật phiên bản mới.** Làm ngoài giờ học, vì các buổi đang chạy dở sẽ mất (mục 11). Thứ tự:

1. Sao lưu.
2. Giải nén bản mới đè lên `/opt/robo-or-sim`, giữ lại `.env`.
3. Chạy `docker compose up -d --build` (cách C: `sudo .venv/bin/pip install -r requirements.txt && sudo systemctl restart robo-or-sim`).
4. Chạy `tools/smoke_test.py`.

**Đổi mã lớp, thêm hoặc đổi mật khẩu giảng viên.** Sửa `.env` (dùng `tools/hash_password.py` để tạo dòng mới), rồi chạy `docker compose up -d` (cách C: `sudo systemctl restart robo-or-sim`).

**Theo dõi.**

- Gắn dịch vụ giám sát (ví dụ UptimeRobot hoặc hệ thống giám sát của trường) vào `https://<tên-miền>/health`, báo khi khác 200. Trang này kiểm tra cả việc ghi vào CSDL và trả về số buổi đang chạy.
- Xem log bằng `docker compose logs -f app` hoặc `docker compose logs -f caddy`. Log Docker được giới hạn 5 × 10 MB mỗi dịch vụ.
- Xem tình trạng bằng `docker compose ps`.

## 10. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `app` không lên "healthy"; log có `RuntimeError: Cấu hình production chưa hợp lệ` | Thiếu `ROBO_INSTRUCTORS`/`ROBO_TOKEN`, hoặc mật khẩu chưa băm | Sửa `.env` theo đúng dòng log báo, rồi `docker compose up -d` |
| Caddy không cấp được chứng chỉ | DNS chưa trỏ đúng, hoặc cổng 80/443 bị chặn | `dig +short <tên-miền>`; kiểm tra tường lửa VPS và nhà cung cấp; `docker compose logs caddy` |
| `bind: address already in use` ở cổng 80/443 | Apache/Nginx có sẵn đang chạy | `sudo systemctl disable --now apache2 nginx`, hoặc dùng cách C |
| Giảng viên nhập đúng vẫn bị hỏi lại mật khẩu | Sai tên đăng nhập (phân biệt hoa thường) hoặc dòng băm bị cắt khi dán | Tạo lại dòng bằng `hash_password.py`, kiểm tra không có dấu cách thừa |
| Sinh viên báo "Sai hoặc thiếu mã lớp" | Mã lớp đã đổi theo đợt | Phát lại link `/sim?class=<MÃ>` mới |
| "Không tìm thấy phiên (có thể máy chủ đã khởi động lại)" | Máy chủ vừa khởi động lại hoặc cập nhật; buổi đang chạy dở mất | Sinh viên bắt đầu lại buổi. Các buổi đã kết thúc không bị mất |
| Video báo lỗi hoặc màn hình đen | Mạng trường chặn YouTube, chủ kênh tắt cho nhúng, hoặc CSP đang chặn | Thử mở youtube.com trên máy đó; đặt `ROBO_CSP_ENFORCE=0` để loại trừ CSP. Phần mô phỏng vẫn chạy được khi không có video |
| Phòng máy cảnh báo "kết nối không an toàn" (cách B) | Chưa cài chứng chỉ gốc Caddy | Làm lại mục 5, bước 5 |

## 11. Giới hạn cần biết

- **Buổi mô phỏng chạy trong trình duyệt (từ bản 0.6).** Máy chủ không giữ buổi trong bộ nhớ: khởi động lại hay cập nhật không làm mất buổi đang dở, và có thể chạy nhiều tiến trình (`--workers N`) khi dùng PostgreSQL (`DATABASE_URL`). Với SQLite nên giữ một tiến trình.
- **SQLite.** Đủ cho quy mô một trường (đã thử 150 buổi đồng thời, xem mục 12). Nếu triển khai cho nhiều trường dùng chung, nên chuyển sang PostgreSQL.
- **Đăng nhập.** HTTP Basic, không có đăng xuất, không có khóa tài khoản khi nhập sai nhiều lần. Nếu cần SSO của trường (Google Workspace, Microsoft 365) hoặc tích hợp LMS (Moodle LTI), cần làm thêm.
- **Dữ liệu cá nhân.** Hệ thống chỉ lưu mã học viên do sinh viên tự nhập. Hướng dẫn sinh viên dùng mã ẩn danh (ví dụ mã do bộ môn cấp), không nhập họ tên hay mã số sinh viên thật. Như vậy CSDL không chứa dữ liệu cá nhân trực tiếp và cũng không có dữ liệu bệnh nhân. Nếu bộ môn muốn gắn kết quả với danh sách sinh viên thật, bảng đối chiếu nên giữ ngoài hệ thống này. Đối chiếu yêu cầu của Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân với bộ phận pháp chế của trường trước khi làm việc đó; tài liệu này không thay cho tư vấn pháp lý.
- **Video.** Video ca mổ nhúng bằng trình phát chính thức của YouTube, không tải về máy chủ. Khi đưa vào chương trình đào tạo chính thức, nên xin phép chủ kênh (Bệnh viện Đa khoa Sài Gòn Phan Rang) hoặc thay bằng video do bệnh viện đối tác cung cấp và đồng ý cho dùng.
- **Nội dung chuyên môn.** Kịch bản module 5 dựng theo quy trình đăng công khai của BV Nguyễn Tri Phương và vẫn ở trạng thái **bản nháp**. Cần hội đồng chuyên môn của bộ môn duyệt trước khi dùng để chấm điểm chính thức.

## 12. Kết quả kiểm thử của bản này (0.5.0)

Đã chạy trong môi trường phát triển: 2 vCPU, 8 GB RAM, Python 3.13 với đúng phiên bản thư viện trong `requirements.txt`.

| Hạng mục | Kết quả |
|---|---|
| Bộ kiểm thử tự động (`pytest`) | 63/63 đạt, gồm đăng nhập, mã lớp, token xAPI, header bảo mật, ghi CSDL song song |
| Uvicorn production sau Caddy 2.8 với `Caddyfile` (HTTPS) | `smoke_test.py` đạt 12/12 mục, có HSTS |
| Uvicorn production sau Caddy với `Caddyfile.lan` (`tls internal`, theo tên và theo IP) | Đạt |
| Mô phỏng môi trường container: cài từ `requirements.txt` vào venv sạch, chạy bằng người dùng uid 10001, đúng lệnh `CMD`, chạy lệnh `HEALTHCHECK` | Đạt |
| Khởi động production thiếu cấu hình | Dừng với thông báo nêu rõ biến còn thiếu |
| Thử tải 60 buổi đồng thời, ê kíp ảo thao tác mỗi 0,2 giây | 0 lỗi; trung vị 50 ms, p95 164 ms; khoảng 230 yêu cầu/giây |
| Thử tải 150 buổi đồng thời | 0 lỗi; trung vị 346 ms, p95 582 ms; khoảng 256 yêu cầu/giây; RAM ứng dụng khoảng 80 MB |
| Thân yêu cầu 3 MB | Caddy từ chối (413) |
| Sao lưu khi đang chạy (9.157 câu lệnh) rồi khôi phục | Đủ số câu lệnh, kiểm tra toàn vẹn đạt |
| `docker compose config` (bản internet và bản LAN) | Hợp lệ |
| Cú pháp unit systemd (`systemd-analyze verify`) | Hợp lệ |

Hai điều giúp đọc đúng các con số tải:

- Sinh viên thật thao tác chậm hơn nhiều: mỗi thao tác cách nhau vài giây chứ không phải 0,2 giây. Một lớp 60 người chỉ tạo khoảng 20–30 yêu cầu/giây.
- Lần thử tải đầu tiên đã phát hiện lỗi "database is locked" khi nhiều buổi ghi cùng lúc. Lỗi này đã được sửa bằng khóa ghi dùng chung và có kiểm thử hồi quy `tests/test_concurrency.py`.

**Chưa kiểm thử được** (môi trường phát triển không tải được ảnh Docker Hub và không có Nginx). Cần chạy trên máy chủ thật khi triển khai lần đầu:

- `docker build` với ảnh `python:3.12-slim` và chạy ảnh `caddy:2`.
- Xin chứng chỉ Let's Encrypt thật (cần tên miền công khai).
- Cấu hình Nginx + certbot (cách C).
- Trình phát YouTube và CSP ở chế độ chặn trên trình duyệt thật (mục 8).

Chạy `tools/smoke_test.py` sau lần triển khai đầu tiên để xác nhận các mục trên.
