# Cách đơn giản: GitHub Pages và Vercel (không cần thuê, không cần quản trị máy chủ)

Từ bản 0.6, toàn bộ buổi mô phỏng chạy **ngay trong trình duyệt** của sinh viên, gồm:

- Phòng mổ 3D, thị phạm, thực hành theo vai, ê kíp ảo.
- Chấm điểm theo quy trình, câu hỏi tình huống, câu hỏi kiến thức.
- Video ca mổ đồng bộ theo bước.

Máy chủ không còn phải "giữ" buổi học. Nhờ vậy cùng một mã nguồn đăng được theo hai kiểu:

| | **GitHub Pages: bản tự luyện** | **Vercel: bản đầy đủ** |
|---|---|---|
| Chi phí | Miễn phí | Có gói miễn phí để dùng thử. Dùng cho trường hoặc bệnh viện nên dùng gói trả phí (gói Hobby chỉ cho mục đích cá nhân, phi thương mại) |
| Mô phỏng 3D, thị phạm, thực hành, chấm điểm, video | Có | Có |
| Bảng điều khiển giảng viên, chi tiết từng buổi, phiếu đánh giá, xuất CSV, gắn mốc video | Có, tại `/giang-vien/`: chấm lại tệp sinh viên nộp, dữ liệu lưu trong trình duyệt của giảng viên | Có, dữ liệu chung trên máy chủ |
| Đăng nhập giảng viên, mã lớp | Không (trang không chứa dữ liệu nào trên mạng) | Có |
| Theo dõi trực tiếp buổi đang làm (ai đang làm, đang ở bước nào, lỗi mới nhất) | Không, chỉ xem sau khi sinh viên nộp tệp | Có, trang `/live`, cập nhật 5 giây |
| Lưu kết quả tập trung | Không. Sinh viên tải **tệp kết quả** về rồi nộp; mỗi giảng viên giữ dữ liệu trên máy mình, chuyển cho nhau bằng tệp sao lưu | Có, tự động vào CSDL Postgres (Neon) |
| Chấm điểm | Trình duyệt của giảng viên **chấm lại** từ nhật ký thao tác (cùng kết quả với máy chủ), sửa điểm trong tệp không có tác dụng | Máy chủ chấm lại nhật ký ngay khi sinh viên nộp |
| Mã lớp | Không | Có |

Gợi ý dùng:

- Chỉ cần sinh viên tự luyện, chưa cần chấm tập trung: chỉ cần GitHub Pages.
- Pilot có giảng viên theo dõi và đánh giá: dùng Vercel. GitHub Pages để làm bản luyện thêm, dùng chung một kho mã.

---

## Bước 0. Đưa mã lên GitHub (một lần)

1. Tạo tài khoản và một repository mới trên github.com, ví dụ `robo-or-sim`. Có thể để Private nếu dùng Vercel. GitHub Pages với repo Private cần gói GitHub trả phí.
2. Giải nén `robo-or-sim.zip`, rồi đẩy lên GitHub theo một trong hai cách:
   - Dùng GitHub Desktop.
   - Dùng dòng lệnh:
     ```bash
     cd robo-or-sim
     git init -b main && git add . && git commit -m "Robo OR Sim 0.6"
     git remote add origin https://github.com/<tai-khoan>/robo-or-sim.git
     git push -u origin main
     ```

## Bước 1. GitHub Pages: bản tự luyện (5 phút)

1. Trên GitHub, vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
2. Vào tab **Actions**, chạy workflow **GitHub Pages** (hoặc đẩy một commit bất kỳ). Workflow làm hai việc:
   - Chạy toàn bộ kiểm thử, gồm đối chiếu bộ chấm trong trình duyệt với bộ chấm Python.
   - Dựng trang tĩnh và đăng lên.
3. Địa chỉ trang có dạng `https://<tai-khoan>.github.io/robo-or-sim/`.

Sau đó, mỗi lần sửa kịch bản trong `scenarios/` và đẩy lên, trang tự cập nhật.

Sinh viên dùng như sau:

- Nhập mã học viên ẩn danh, chọn kịch bản và chế độ.
- Cuối buổi bấm **Tải tệp kết quả** (.json).
- Nộp tệp này cho giảng viên qua LMS, email hoặc Zalo.

## Bước 1b. Bảng điều khiển giảng viên trên GitHub Pages (không cần Vercel)

Địa chỉ: `https://<tai-khoan>.github.io/robo-or-sim/giang-vien/`. Trang có sẵn sau Bước 1, không phải cài thêm.

1. Sinh viên làm buổi thực hành trên bản tự luyện, cuối buổi bấm **Tải tệp kết quả** và nộp tệp `.json`.
2. Giảng viên mở trang trên, bấm **Nhập tệp kết quả của sinh viên**, chọn nhiều tệp một lần. Trình duyệt chạy lại nhật ký thao tác bằng chính bộ chấm của hệ thống; tệp bị sửa bị từ chối, tệp nộp hai lần không tạo buổi trùng.
3. Xem tổng hợp lỗi theo giai đoạn, vai trò; mở **Chi tiết, chấm** từng buổi; điền phiếu đánh giá; **Xuất CSV**.
4. **Bắt buộc:** cuối mỗi buổi chấm bấm **Xuất sao lưu** và cất tệp (Drive của bộ môn). Dữ liệu chỉ nằm trong trình duyệt trên máy đó; xoá dữ liệu trình duyệt, đổi máy hay dùng chế độ ẩn danh là mất. Giảng viên khác dùng **Nhập sao lưu (gộp)** để có cùng dữ liệu.
5. Trang `/giang-vien/video-markers.html` gắn mốc video; bấm **Xuất mốc (JSON)** rồi đưa tệp vào `media/markers/` của repo để sinh viên thấy mốc.

Giới hạn cần biết của bản này:

- Không có đăng nhập: ai mở trang cũng thấy giao diện, nhưng chỉ thấy dữ liệu trên chính máy của họ (không có dữ liệu nào nằm trên mạng).
- Không biết thời điểm bắt đầu thật của buổi (không có máy chủ cấp mã buổi), nên không chặn được nhật ký "dựng tay". Người rành kỹ thuật có thể tự tạo một tệp làm đúng hết vì toàn bộ kịch bản và đáp án nằm trong trang tĩnh. Dùng cho tự luyện, đánh giá quá trình; bài đánh giá tổng kết nên dùng bản Vercel và quan sát trực tiếp.
- Dung lượng lưu của trình duyệt khoảng 5 MB, đủ vài trăm buổi (mỗi tệp 6–9 KB). Mọi repo Pages của cùng tài khoản dùng chung vùng lưu này.
- Dùng máy cá nhân của giảng viên, không dùng máy chung của phòng học.

## Bước 2. Vercel: bản đầy đủ có giảng viên (15 phút)

**2.1 Tạo tài khoản giảng viên (làm trên máy tính của bạn, cần Python 3.10+):**

```bash
python tools/hash_password.py --user gv.lan        # Windows: py tools\hash_password.py --user gv.lan
```

Lệnh in ra một dòng `gv.lan=pbkdf2:600000:...`. Nhiều giảng viên thì nối các dòng bằng dấu `;`.

**2.2 Tạo dự án:**

1. Vào vercel.com, đăng nhập bằng GitHub, chọn **Add New → Project** và chọn repo `robo-or-sim`. Vercel tự nhận ứng dụng FastAPI qua `pyproject.toml`, không cần chỉnh gì.
2. Trước khi bấm Deploy, mở **Environment Variables** và thêm:

   | Biến | Giá trị |
   |---|---|
   | `ROBO_ENV` | `production` |
   | `ROBO_INSTRUCTORS` | dòng tạo ở bước 2.1 |
   | `ROBO_CLASS_CODE` | mã lớp, ví dụ `NOISOI-K47` |
   | `ROBO_TOKEN` | chuỗi ngẫu nhiên dài, ví dụ tạo bằng `python -c "import secrets;print(secrets.token_urlsafe(32))"` |

3. Bấm **Deploy**. Lần đầu máy chủ sẽ **báo lỗi thiếu `DATABASE_URL`**. Đây là chủ ý, để không chạy khi chưa có CSDL lưu bền.
4. Vào dự án, chọn **Storage → Create Database → Neon (Postgres)**:
   - Chọn vùng **Singapore**, cùng vùng với máy chủ đã đặt sẵn trong `vercel.json`.
   - Bấm **Connect** vào dự án. Vercel tự thêm biến `DATABASE_URL`.
5. Vào **Deployments**, chọn **Redeploy**.
6. Mở `https://<du-an>.vercel.app/health`. Kết quả đúng là `{"ok":true,...,"db":"postgres"}`.
7. Gắn tên miền riêng (không bắt buộc) ở **Settings → Domains**. HTTPS có sẵn.

**2.3 Kiểm tra** (trên máy bạn):

```bash
python tools/smoke_test.py --url https://<du-an>.vercel.app --user gv.lan --class-code NOISOI-K47
```

Kết quả phải ra `KẾT QUẢ: đạt`. Công cụ để lại một buổi thử mã `SMOKE-TEST`.

**2.4 Bàn giao:**

- **Sinh viên** mở `https://<du-an>.vercel.app/sim?class=NOISOI-K47`; nên in đường dẫn thành mã QR.
- **Giảng viên** mở `https://<du-an>.vercel.app/` để xem bảng điều khiển, chi tiết từng buổi, phiếu đánh giá và xuất CSV.
- **Trong giờ học**, giảng viên mở `https://<du-an>.vercel.app/live` (Theo dõi trực tiếp): mỗi sinh viên một dòng, gồm thời gian đã làm, số bước xong, bước đang chờ sinh viên, số lỗi và lỗi mới nhất. Buổi có lỗi nghiêm trọng nổi lên đầu, tô đỏ; buổi quá 45 giây không có tín hiệu chuyển "Tạm dừng"; buổi nộp xong chuyển "Đã nộp" kèm điểm và nút **Chi tiết, chấm**. Trình duyệt sinh viên gửi tiến độ khoảng 10 giây một lần và ngay khi mắc lỗi nghiêm trọng; máy chủ chạy lại nhật ký để kiểm tra trước khi hiển thị.
- **Nộp tệp từ bản GitHub Pages:** trên bảng điều khiển bấm **Nhập tệp kết quả của sinh viên**. Máy chủ chấm lại từ nhật ký thao tác và hiển thị như các buổi khác.
- **Mốc video:** giảng viên gắn tại `/video-markers`. Muốn bản GitHub Pages cũng có mốc thì xuất tệp mốc, lưu vào `media/markers/` trong repo rồi đẩy lên.

**Đổi mã lớp hoặc thêm giảng viên:** sửa biến ở **Settings → Environment Variables**, rồi chọn **Redeploy**.

## Cơ chế giữ điểm trung thực (đọc trước khi dùng để chấm)

- Trình duyệt ghi lại **nhật ký thao tác**: thời điểm, vai, hành động, vị trí đứng. Máy chủ không tin điểm do trình duyệt tính mà chạy lại toàn bộ nhật ký bằng bộ chấm Python. Máy chủ từ chối nhật ký khi:
  - ê kíp ảo làm khác quy trình;
  - học viên làm việc của vai khác;
  - thời gian chạy lùi hoặc dài hơn thời lượng thật của buổi;
  - buổi đã nộp một lần.
- Câu hỏi kiến thức ở bản Vercel được chấm trên máy chủ; đáp án không gửi xuống trình duyệt.
- Kiểm thử đối chiếu cho thấy bộ chấm trong trình duyệt và bộ chấm Python cho kết quả trùng khớp: 1.600 buổi ngẫu nhiên, 66.431 thao tác, 0 sai lệch.

**Giới hạn cần nói rõ:**

- Trình tự bước, đáp án câu hỏi tình huống và vùng đứng đúng nằm trong trình duyệt, nên người rành kỹ thuật có thể đọc được và tự dựng một nhật ký "làm đúng hết".
- Ở bản GitHub Pages, câu hỏi kiến thức chấm ngay trên máy nên đáp án cũng nằm trong trang.
- Vì vậy điểm mô phỏng phù hợp cho **đánh giá quá trình, tự luyện**. Đánh giá tổng kết nên kết hợp quan sát trực tiếp của giảng viên qua phiếu đánh giá có sẵn.

## Giới hạn kỹ thuật khác

- **Vercel:** lần truy cập đầu sau một thời gian không dùng có thể chậm 1–3 giây (khởi động nguội). Sau đó bình thường.
- **Dữ liệu:** chỉ lưu mã học viên ẩn danh, không có dữ liệu người bệnh. Máy chủ Vercel và Neon đặt tại Singapore, nằm ngoài Việt Nam. Nếu trường có quy định về nơi lưu dữ liệu, cân nhắc bản VPS trong nước (xem DEPLOY.md).
- **YouTube:** mạng trường chặn YouTube thì video không phát, nhưng phần mô phỏng vẫn chạy.
- Ứng dụng Unreal gửi xAPI vào `POST /xapi/statements` với header `Authorization: Bearer <ROBO_TOKEN>`, như bản 0.5.

## Đã kiểm thử những gì (bản 0.7.0)

| Hạng mục | Kết quả |
|---|---|
| Bộ kiểm thử tự động | 79/79 đạt trên SQLite và 79/79 trên PostgreSQL 16 |
| Song song sinh viên + giảng viên (máy chủ 2 tiến trình, PostgreSQL, Chromium thật) | 2 sinh viên làm module 5 qua giao diện cùng lúc + 20 sinh viên ảo; giảng viên thấy đủ 20+ buổi đang làm, tiến độ tăng dần, buổi lỗi nghiêm trọng lên đầu và tô đỏ, buổi bỏ dở chuyển Tạm dừng, buổi nộp chuyển Đã nộp kèm điểm, mở được chi tiết để chấm; không lỗi JavaScript |
| Tải theo dõi trực tiếp | 100 sinh viên gửi tiến độ 2 giây/lần (tương đương 500 sinh viên ở nhịp thật 10 giây) + 3 giảng viên mở trang: 2.994 lượt gửi, 0 lỗi, p95 156 ms; trang giảng viên p95 253 ms |
| Bảng điều khiển bản tĩnh so với máy chủ | 145 tệp ngẫu nhiên: từng trường (điểm, lỗi, dòng thời gian, từng bước, giai đoạn, câu hỏi), tổng hợp và CSV trùng khớp; tệp bị sửa bị cả hai từ chối |
| Trình duyệt thật, bảng điều khiển bản tĩnh | Nhập 15 tệp, nhập trùng, tệp sửa, chi tiết, phiếu đánh giá, CSV, xuất/xoá/nhập sao lưu, gắn và xuất mốc video: đạt, không lỗi JavaScript |
| Đối chiếu bộ chấm trình duyệt với Python | 1.600 buổi ngẫu nhiên, 0 sai lệch (kiểm thử tự động 240 buổi chạy mỗi lần đẩy mã) |
| Trình duyệt thật (Chromium), bản tĩnh như GitHub Pages, đặt dưới đường dẫn con `/robo-or-sim/` | Thị phạm và thực hành module 5 vai phụ mổ qua giao diện đạt; tải tệp kết quả được |
| Trình duyệt thật, bản có máy chủ, **2 tiến trình** + PostgreSQL (mô phỏng nhiều instance như Vercel) | Sai mã lớp bị chặn; thực hành module 5 đạt; máy chủ chấm lại và lưu; nhập tệp từ bản tĩnh đạt |
| Nhiều tiến trình khởi động cùng lúc trên PostgreSQL | Lần thử đầu phát hiện **lỗi tranh chấp khi tạo bảng**. Đã sửa bằng khóa Postgres; khởi động đồng thời 3 lần liên tiếp đều đạt |
| `smoke_test.py` với máy chủ 2 tiến trình | Đạt |
| 100 sinh viên bắt đầu và nộp **cùng một lúc** | 0 lỗi; trung vị 0,9 giây, p95 2,1 giây (máy thử 2 vCPU) |

**Chưa kiểm thử được ở đây** (không có tài khoản GitHub hay Vercel trong môi trường phát triển):

- Chạy workflow GitHub Pages thật.
- Deploy thật lên Vercel và tích hợp Neon.

Lần đầu triển khai, làm đúng các bước trên rồi chạy `smoke_test.py`. Nếu bước nào báo lỗi, gửi lại nội dung lỗi để xử lý.
