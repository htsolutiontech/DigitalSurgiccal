# Robo OR Sim – mã demo theo thiết kế Phương án 3

Khung mã cho hệ thống mô phỏng quy trình và ê kíp phòng mổ robot, bám theo tài liệu
"Phương án 3: Mô phỏng 3D chân thực đào tạo phẫu thuật robot". Phiên bản 0.7.0, ngày 12/10/2026.

**Đưa lên site chạy thật:**
- Đơn giản nhất: **[DEPLOY_SIMPLE.md](DEPLOY_SIMPLE.md)**. GitHub Pages (miễn phí, không máy chủ) cho bản tự luyện và bảng điều khiển giảng viên chấm tệp sinh viên nộp (`/giang-vien/`, dữ liệu lưu trong trình duyệt giảng viên); Vercel + Neon cho bản có dữ liệu chung, đăng nhập và **Theo dõi trực tiếp** (`/live`: sinh viên nào đang làm, đang ở bước nào, lỗi mới nhất, cập nhật 5 giây).
- Máy chủ riêng (VPS trong nước, mạng nội bộ trường): [DEPLOY.md](DEPLOY.md).

Từ bản 0.6, buổi mô phỏng chạy trong trình duyệt (`backend/static/sim/engine.js`, bản dịch 1-1 của `simcore/`). Máy chủ chỉ cấp token, **chấm lại nhật ký thao tác bằng bộ chấm Python** và lưu kết quả. `tests/test_parity.py` bảo đảm hai bộ chấm cho cùng kết quả.

> Tất cả kịch bản đang ở trạng thái **bản nháp** (`approval.status = "draft"`).
> Trình tự, thời gian giới hạn, khoảng cách vô khuẩn là giá trị minh họa; phải được hội đồng
> chuyên môn bệnh viện đối tác duyệt và đối chiếu hướng dẫn của hãng robot trước khi giảng dạy.

## Trạng thái từng phần

| Phần | Thư mục | Trạng thái |
| --- | --- | --- |
| Kịch bản module 2, 3, 6 (JSON) | `scenarios/` | Viết xong, kiểm tra cấu trúc tự động |
| **Module 5: nội soi cắt ruột thừa theo quy trình BV Nguyễn Tri Phương** (2 ca bệnh) | `scenarios/m5_lap_appendectomy_ntp.json` | **Chạy được**, thị phạm và thực hành; kiểm thử đầu cuối |
| **Video ca mổ thật đồng bộ theo bước** + trang giảng viên gắn mốc video | `media/videos.json`, `backend/media.py`, `backend/static/video_markers.html`, `backend/static/sim/video.js` | Chạy được; **chưa có mốc nào**, giảng viên cần gắn |
| Báo cáo chi tiết từng buổi, phiếu đánh giá giảng viên, xuất CSV | `backend/reports.py`, `backend/static/session.html` | Chạy được |
| Lõi chấm điểm bản tham chiếu (Python) | `simcore/` | **Đã chạy và kiểm thử: 42/42 ca đạt** |
| Máy chủ xAPI tối giản + API báo cáo | `backend/` | **Đã chạy thật qua HTTP** |
| Bảng điều khiển giảng viên | `backend/static/dashboard.html` | Chạy được, tự cập nhật 5 giây, mở tại `http://127.0.0.1:8000/` |
| **Hệ thống mô phỏng chạy thực (3D, thị phạm và thực hành)** | `backend/runtime.py`, `backend/static/sim/` | **Chạy được**, mở tại `http://127.0.0.1:8000/sim`; đã kiểm thử đầu cuối bằng trình duyệt giả lập |
| Ê kíp giả lập tạo dữ liệu mẫu | `simcore/replay.py`, `tools/run_demo.py` | Chạy được |
| **Triển khai chạy thật**: đăng nhập giảng viên, mã lớp, token xAPI, Docker + Caddy HTTPS, systemd + Nginx, sao lưu, kiểm tra sau triển khai, thử tải | `DEPLOY.md`, `Dockerfile`, `docker-compose*.yml`, `deploy/`, `tools/` | Chạy thử production sau Caddy HTTPS đạt; thử tải 150 buổi đồng thời 0 lỗi. **Chưa build được ảnh Docker** trong môi trường phát triển |
| Mã C++ Unreal Engine 5 | `ue5/` | **Khung mã, CHƯA biên dịch**; **chưa cập nhật** các tính năng của bản 0.3.0 (ca bệnh, bước có điều kiện, câu hỏi tình huống, vị trí, câu hỏi kiến thức) |

## Kiến trúc (ánh xạ với sơ đồ trong tài liệu)

```
Kịch bản JSON (do hội đồng chuyên môn duyệt)
      │  dùng chung
      ├──────────────► simcore (Python)   ── kiểm thử, ê kíp giả lập, chuẩn tham chiếu
      └──────────────► ue5 FScenarioEngine (C++) ── chạy trong ứng dụng VR, nhiều người
                                │ xAPI 1.0.3 (cùng cấu trúc câu lệnh)
                                ▼
                       backend: mini-LRS + /api/sessions + /api/summary
                                ▼
                       Bảng điều khiển giảng viên
```

Nguyên tắc: logic chấm nằm trong **một bộ máy xác định** (cùng chuỗi hành động → cùng kết quả).
Bản Python là chuẩn tham chiếu; bản C++ phải cho kết quả giống hệt trên cùng ca kiểm thử.

## Chạy thử (Python 3.10 trở lên)

```bash
pip install -r requirements.txt

# 1. Chạy toàn bộ kiểm thử
python -m pytest -q

# 2. Chạy ê kíp giả lập, in kết quả (không cần mở máy chủ)
python tools/run_demo.py

# 3. Một lệnh: tự bật máy chủ, gửi dữ liệu mẫu, giữ bảng điều khiển chạy (Ctrl+C để tắt)
python tools/run_demo.py --serve
# mở http://127.0.0.1:8000/ trên trình duyệt

# 3b. Hoặc bật máy chủ riêng: cửa sổ dòng lệnh thứ nhất (giữ mở)
python -m uvicorn backend.app:app --port 8000
#     rồi ở cửa sổ thứ hai
python tools/run_demo.py --url http://127.0.0.1:8000
```

Kết quả mẫu của bước 2:

| Kịch bản | Ê kíp | Điểm | Kết quả | Lỗi chính |
| --- | --- | --- | --- | --- |
| m6 tháo robot khẩn cấp | A | 100 | Đạt | – |
| m6 | B | 97 | Đạt | Sai vai trò khi rút ống soi |
| m6 | C | 29 | Không đạt | Đổi tư thế bàn khi còn gắn robot; tháo tay khi dụng cụ còn trong ổ bụng; bỏ sót gọi hỗ trợ; quá giờ |
| m3 bảng kiểm an toàn | A | 100 | Đạt | – |
| m3 | D | 46 | Không đạt | Khởi mê khi chưa hỏi dị ứng; rạch da trước khi xác nhận kháng sinh; chưa đếm dụng cụ |
| m2 vô khuẩn | SV 01 | 100 | Đạt | – |
| m2 | SV 02 | 60 | Không đạt | Rửa tay chưa đủ thời gian; tay chưa vô khuẩn chạm bàn dụng cụ |

Đây là dữ liệu tổng hợp để kiểm thử, không phải dữ liệu học viên thật.

Nếu dùng Python 3.14 mà máy chủ không khởi động được, nâng cấp `pip install -U fastapi uvicorn pydantic` hoặc dùng Python 3.12/3.13.

Lỗi `ConnectionRefusedError` / `WinError 10061` nghĩa là máy chủ chưa chạy ở địa chỉ `--url`.
Dùng `--serve`, hoặc bật uvicorn ở một cửa sổ riêng như bước 3b. Trên Windows có thể bấm đúp `run_demo.bat`.


## Module 5: Phẫu thuật nội soi cắt ruột thừa (theo quy trình BV Nguyễn Tri Phương)

Nguồn: [Quy trình Phẫu thuật nội soi cắt ruột thừa, BV Nguyễn Tri Phương](https://bvnguyentriphuong.com.vn/ngoai-tong-hop/quy-trinh-phau-thuat-noi-soi-cat-ruot-thua) (đăng 02/12/2021).
Đây là **mổ nội soi thường** (phẫu thuật viên cầm dụng cụ), không phải mổ robot; phòng mổ 3D tự chuyển sang bố trí nội soi: cất xe robot và bàn điều khiển, màn hình bên trái người bệnh ngang vai, bàn dụng cụ ngang gối.

### Đối chiếu văn bản quy trình với mô phỏng

| Nội dung trong quy trình | Trong mô phỏng |
| --- | --- |
| Giải thích người bệnh và gia đình; giấy cam đoan; xét nghiệm cơ bản, X quang phổi; điện tâm đồ nếu từ 40 tuổi; nhịn ăn ít nhất 6 giờ; vệ sinh vùng mổ; đi tiểu hoặc sonde tiểu; bệnh án, hội chẩn, khám tiền mê | Giai đoạn "Tiền phẫu tại khoa", vai BS điều trị, ĐD khoa Ngoại, BS gây mê. Điện tâm đồ chỉ bắt buộc ở ca 52 tuổi; làm ở ca 24 tuổi không bị trừ điểm. Nhịn ăn là câu hỏi tình huống. Sonde tiểu hiện trên người bệnh 3D |
| Kiểm tra hồ sơ (hội chẩn, cam kết, duyệt mổ, khám tiền phẫu, tiền mê); kiểm tra đúng người bệnh | Giai đoạn "Kiểm tra tại phòng mổ" |
| Gây mê nội khí quản; nằm ngửa | Bước bắt buộc trước khi đặt trocar |
| PTV bên phải người bệnh; phụ cầm camera bên phải PTV; dụng cụ viên ngang gối trái; màn hình bên trái ngang vai; bàn dụng cụ ngang gối | Học viên **bấm lên sàn phòng mổ 3D** để chọn chỗ đứng hoặc chỗ đặt thiết bị; máy chủ kiểm tra theo vùng đúng |
| Bước 1: trocar camera cạnh rốn, hai trocar thao tác | Trocar hiện trên thành bụng 3D; ống soi nối tay người phụ, hai dụng cụ nối tay PTV |
| Bước 2: kiểm tra ổ phúc mạc, bộc lộ và đánh giá ruột thừa | Hình ống soi lia toàn ổ bụng rồi vào hố chậu phải; **học viên đánh giá ruột thừa từ hình** (câu hỏi tình huống) |
| Bước 3: phẫu tích mạc treo sát gốc, cầm máu | Hình ống soi có dao điện, khói, các điểm cầm máu |
| Bước 4: buộc chỉ gốc ruột thừa hoặc stapler, cắt ruột thừa | Vòng chỉ buộc ở gốc, cắt |
| Bước 5: hút dịch bẩn; viêm phúc mạc thì súc rửa nước muối đẳng trương; không rửa sạch được thì chuyển mổ mở | Hút, súc rửa (bắt buộc ở ca viêm phúc mạc), câu hỏi tình huống có rửa sạch được không |
| Bước 6: lấy bệnh phẩm qua vết mổ; dẫn lưu nếu viêm phúc mạc nhiều dịch bẩn; đóng trocar | Đặt dẫn lưu ở ca không viêm phúc mạc bị ghi "không có chỉ định"; đóng trocar trước khi súc rửa xong là sai trình tự |
| Theo dõi: kháng sinh, giảm đau; vận động sớm; ăn sớm khi có nhu động ruột; biến chứng | Giai đoạn "Hậu phẫu"; thời điểm cho ăn là câu hỏi tình huống |
| Xử trí tai biến, biến chứng; chỉ định, chống chỉ định | 5 câu hỏi kiến thức cuối buổi, chấm riêng |

Phần **bổ sung, không có trong văn bản**, được đánh dấu nguồn trong kịch bản và trên báo cáo:
- Time out trước rạch da và đếm dụng cụ, gạc, kim: theo Bảng kiểm an toàn phẫu thuật WHO.
- Vị trí hai trocar thao tác (hố chậu trái, trên mu), bàn dụng cụ đặt phía trái: lựa chọn minh họa.
- Áp lực bơm hơi: không ghi số, theo quy định khoa.

### Hai ca bệnh

| Ca | Dữ kiện | Bước thay đổi theo ca |
| --- | --- | --- |
| A: Nam 24 tuổi, đau hố chậu phải 18 giờ | Viêm ruột thừa cấp chưa biến chứng | Không bắt buộc điện tâm đồ, súc rửa, dẫn lưu |
| B: Nữ 52 tuổi, đau bụng 3 ngày, sốt cao | Ruột thừa vỡ, viêm phúc mạc, rửa sạch được bằng nội soi | Bắt buộc điện tâm đồ, súc rửa, đánh giá rửa sạch, dẫn lưu |

Tiêu đề ca chỉ nêu bệnh cảnh; chẩn đoán trong mổ học viên phải tự đánh giá từ hình ống soi.

### Cách dùng cho sinh viên thực tập

1. Giảng viên chiếu chế độ **Xem thị phạm** cho cả lớp (ca A rồi ca B), giải thích ghi chú chuyên môn hiện sau mỗi bước.
2. Sinh viên chọn **Thực hành**, chọn ca, chọn vai (gợi ý: Phụ mổ cầm camera, Dụng cụ viên, ĐD chạy ngoài, BS điều trị, ĐD khoa Ngoại) và nhập mã học viên.
3. Ê kíp ảo làm các vai khác và **dừng chờ** ở bước thuộc vai của sinh viên. Bảng thao tác hiện mọi việc của giai đoạn hiện tại, kể cả việc của vai khác, để kiểm tra sinh viên biết đúng việc của mình. "Hiện gợi ý các bước" giúp người mới; tắt khi đánh giá.
4. Cuối buổi: 5 câu hỏi kiến thức, rồi kết quả theo từng giai đoạn và liên kết "Báo cáo chi tiết buổi này".

### Cách dùng cho giảng viên

- `http://<máy chủ>:8000/`: tổng hợp số buổi, tỉ lệ đạt, điểm quy trình, tỉ lệ đúng câu hỏi kiến thức, **lỗi theo giai đoạn**, lỗi theo vai, lỗi thường gặp; tự cập nhật 5 giây; **Xuất CSV** mở được bằng Excel.
- "Chi tiết, chấm" trên từng dòng mở `/session?reg=...`: tiến độ và lỗi theo 5 giai đoạn, bảng từng bước (thời điểm, ai làm, lỗi, bước không áp dụng ở ca này), câu trả lời câu hỏi kiến thức, dòng thời gian, và **phiếu đánh giá của giảng viên** (6 tiêu chí thang 1–5, kết luận Đạt / Chưa đạt / Cần làm lại, nhận xét). Có thể in báo cáo.
- Thang 1–5 và 6 tiêu chí do nhóm phát triển đề xuất, chưa phải công cụ đã thẩm định; bộ môn nên thay bằng tiêu chí của mình (sửa mục `rubric` trong kịch bản).

### Cách chấm module 5

| Loại lỗi | Trừ điểm | Ghi chú |
| --- | --- | --- |
| Bỏ sót bước then chốt (bắt buộc ở ca này) | 12 | Bước không áp dụng ở ca này không bị tính |
| Lỗi nghiêm trọng | 20 | Có lỗi nghiêm trọng thì không đạt |
| Sai trình tự | 4 | Bước vẫn được tính |
| Đánh giá, quyết định sai | 8 | Phải chọn lại cho đúng mới đi tiếp |
| Đứng hoặc đặt thiết bị sai vị trí | 4 | Phải chọn lại |
| Làm việc không có chỉ định ở ca này | 4 | Ví dụ đặt dẫn lưu ở ca A |
| Làm việc của vai khác | 2 | Không được tính bước |
| Ngưỡng đạt | 75 điểm | Câu hỏi kiến thức chấm riêng, không cộng vào điểm quy trình |

Các trọng số là đề xuất ban đầu, sửa trong mục `scoring` của kịch bản.

### Giới hạn của module 5

- Video ca mổ đã được nhúng (xem mục dưới), nhưng hình ống soi trong mô phỏng vẫn là sơ đồ vẽ theo văn bản quy trình, chưa chỉnh theo video.
- Văn bản quy trình đăng năm 2021; cần xác nhận bệnh viện còn áp dụng bản này.
- Chưa có nhánh **chuyển mổ mở** chạy tiếp (ca C); hiện chỉ kiểm tra quyết định.
- Bản Unreal C++ chưa có các tính năng mới.

## Video ca mổ thật, đồng bộ theo bước

Video đang dùng cho module 5: [Phẫu thuật nội soi viêm ruột thừa, dấu hiệu nhận biết viêm ruột thừa](https://www.youtube.com/watch?v=lFUi_ozMJUc), kênh Bệnh Viện Đa Khoa Sài Gòn Phan Rang (thông tin lấy qua YouTube oEmbed ngày 06/10/2026).

**Cách hoạt động**
- Video được **nhúng bằng trình phát chính thức của YouTube** (youtube-nocookie.com); hệ thống không tải xuống hay lưu bản sao. Máy xem cần Internet; mất mạng thì mô phỏng vẫn chạy, chỉ không có video.
- Giảng viên mở `http://<máy chủ>:8000/video-markers`, phát video, dừng ở đầu một bước bấm **[**, tới cuối bước bấm **]**, ghi chú nếu cần, đánh dấu nếu đoạn đó **khác quy trình đang dùng làm chuẩn chấm**, rồi bấm **S** để lưu và tự sang bước tiếp. Có nút xem thử đoạn, thanh thời gian hiện các đoạn đã gắn, xuất và nhập mốc dạng JSON để chia sẻ giữa giảng viên.
- Trong `/sim`, khi một bước hoàn thành (do ê kíp ảo hay sinh viên), khung video tự phát **đúng đoạn thật** của bước đó rồi dừng ở cuối đoạn. Chế độ thị phạm có tùy chọn **chờ hết đoạn video** mới sang bước tiếp, để giảng viên chiếu cho lớp: hình 3D, sơ đồ ống soi và video thật chạy cùng nhịp.
- Đoạn được đánh dấu khác quy trình hiện cảnh báo: sinh viên làm theo quy trình của bệnh viện, không làm theo video.
- Để bảo vệ mốc khỏi bị sửa nhầm: đặt biến môi trường `ROBO_INSTRUCTOR_KEY`, giảng viên nhập mã này trên trang gắn mốc.
- Thêm video khác (kể cả cho module robot): khai báo trong `media/videos.json` (nguồn, kênh, ghi chú).

**Vì sao chưa có mốc sẵn:** công cụ phát triển không xem được nội dung video và YouTube chặn đọc phần mô tả (lỗi 429), nên không xác định được bước nào ở giây thứ mấy. Gắn mốc cần người có chuyên môn xem video; với video vài phút, gắn khoảng 15 bước kỹ thuật mất chừng 20–30 phút. Các bước tiền phẫu, hậu phẫu thường không có trong video, để trống.

**Lưu ý chuyên môn và pháp lý**
- Video là của **BV Đa khoa Sài Gòn Phan Rang**, còn quy trình chấm là của **BV Nguyễn Tri Phương**: kỹ thuật, dụng cụ (ví dụ buộc chỉ hay kẹp clip gốc ruột thừa), vị trí trocar có thể khác. Phải đánh dấu các đoạn khác khi gắn mốc.
- Nhúng video công khai bằng trình phát của YouTube là cách sử dụng YouTube cho phép; khi đưa vào chương trình đào tạo chính thức, nên xin phép đơn vị sở hữu. Không cắt ghép hay tải lại video lên nơi khác.
- Nếu video bị chủ sở hữu gỡ hoặc tắt nhúng, khung video sẽ báo lỗi của YouTube; mô phỏng vẫn chạy.

## Hệ thống mô phỏng chạy thực (`/sim`)

Mở bằng một lệnh (Windows: bấm đúp `run_demo.bat`):

```bash
python tools/run_demo.py --serve --open
```

Hai chế độ:

| Chế độ | Ai làm | Ghi điểm | Dùng khi |
| --- | --- | --- | --- |
| Xem thị phạm | Ê kíp ảo làm đúng toàn bộ quy trình, từng bước hiện trên cảnh 3D, màn hình ống soi và nhật ký | Không | Giảng viên chiếu cho cả lớp trước buổi thực hành |
| Thực hành | Học viên đóng một vai; ê kíp ảo làm các vai còn lại và chờ học viên ở những bước thuộc vai đó | Có, chấm trên máy chủ, hiện ngay trên bảng điều khiển | Sinh viên tự luyện trước khi vào phòng mổ thật |

Theo kịch bản:
- **Module 6, tháo robot khẩn cấp:** đèn báo động, bộ mổ mở, rút dụng cụ, tháo từng tay robot, đẩy xe, PTV từ bàn điều khiển về bàn mổ đều hiện trên cảnh 3D. Bảng thao tác trộn lẫn việc đúng vai, việc của vai khác và thao tác nguy hiểm (nét đứt) để kiểm tra học viên có biết đúng việc, đúng lúc.
- **Module 3, bảng kiểm an toàn:** cảnh chuyển từ Sign in (người bệnh chưa mê) sang Time out (ê kíp tập trung), phẫu thuật, rồi Sign out.
- **Module 2, vô khuẩn:** bấm sàn để di chuyển nhân vật sinh viên; tới bồn rửa tay, giữ nút rửa tay (có tùy chọn tua nhanh); bật "Chạm tay" để chạm khăn mổ hoặc bàn dụng cụ; đứng vào vòng vàng. Chạm vùng vô khuẩn khi chưa mang găng, hoặc đứng quá gần khi chưa mặc áo, đều bị ghi lỗi.

Dùng cho một lớp học trong mạng nội bộ:

```bash
python tools/run_demo.py --serve --host 0.0.0.0
```

Sinh viên mở `http://<IP máy giảng viên>:8000/sim`; giảng viên mở `http://<IP>:8000/` để theo dõi. Có thể cần mở cổng 8000 trên tường lửa Windows. Chỉ dùng trong mạng nội bộ: máy chủ demo chưa có đăng nhập.

Đã kiểm thử: API phiên chạy (4 ca pytest) và kiểm thử đầu cuối chạy `app.js` + `or3d.js` + `endo.js` trên Node với DOM giả lập, gọi máy chủ thật: thị phạm cả 3 module đạt 100 điểm; thực hành module 6 vai phụ mổ có một lỗi nghiêm trọng được ghi đúng; thực hành module 2 ghi đúng lỗi đứng quá gần và chạm vùng vô khuẩn; kết quả hiện trên bảng điều khiển.
**Chưa kiểm thử trên trình duyệt thật có GPU** trong môi trường phát triển; cần mở thử trên Chrome hoặc Edge và báo lỗi hiển thị nếu có.

Giới hạn:
- Phiên đang chạy giữ trong bộ nhớ máy chủ; khởi động lại máy chủ thì phiên dở bị mất (dữ liệu đã chấm vẫn còn).
- Hình người và thiết bị là mô hình khối dựng bằng code, chưa phải nhân vật chân thực (xem lộ trình Unreal/MetaHuman).
- Bồn rửa tay đặt trong phòng để mô phỏng; thực tế nằm ở khu rửa tay sát phòng mổ.
- Kịch bản là bản nháp, chưa được hội đồng chuyên môn duyệt.

## Định dạng kịch bản

Mỗi bước gồm: `id`, `title`, `roles` (ai được làm), `action`, `after` (bước phải xong trước),
`critical`, tùy chọn `target`/`targets` và `min_duration_s`. `rules` mô tả hành động nguy hiểm
bị chặn theo trạng thái (`any_arm_docked`, `target_has_instrument`). `scoring` đặt trọng số trừ điểm
và ngưỡng đạt. Bộ đọc từ chối kịch bản có vai trò lạ, bước phụ thuộc không tồn tại hoặc vòng lặp.

Cách chấm:
- Hành động nguy hiểm theo `rules`: bị chặn, ghi lỗi nghiêm trọng, không làm thay đổi trạng thái.
- Sai vai trò: không tính bước, ghi lỗi nhẹ.
- Sai trình tự: vẫn tính bước, ghi lỗi trung bình.
- Thiếu thời lượng tối thiểu: không tính bước, ghi lỗi nghiêm trọng, phải làm lại.
- Vô khuẩn: tay chưa vô khuẩn chạm vùng vô khuẩn là lỗi nghiêm trọng; người không mặc áo vô khuẩn
  đứng quá gần là cảnh báo (có thời gian chờ 5 giây để không báo lặp).
- Không đạt nếu dưới ngưỡng điểm, bỏ sót bước then chốt, hoặc có lỗi nghiêm trọng (cấu hình được).

## Dữ liệu và quyền riêng tư

- Học viên định danh bằng mã ẩn danh trong `actor.account`; không dùng email, không có dữ liệu người bệnh
  (có kiểm thử tự động cho điều này).
- Bản 0.5.0 đã có xác thực giảng viên (mật khẩu băm PBKDF2), mã lớp cho sinh viên, token cho ứng dụng Unreal,
  HTTPS qua Caddy/Nginx, sao lưu hằng ngày (xem DEPLOY.md). Kho xAPI vẫn là bản tối giản; khi cần đồng bộ
  với LMS hoặc dùng cho nhiều trường, chuyển sang một LRS đạt chuẩn.
- Đổi `BASE_IRI` trong `simcore/xapi.py` và `BaseIri` trong `ue5/Config/DefaultGame.ini` sang tên miền thật.

## Bản Unreal Engine 5 (`ue5/`)

Các lớp chính:

| Lớp | Vai trò |
| --- | --- |
| `FScenarioEngine` | Bản C++ của `simcore/engine.py`, không phụ thuộc UObject |
| `UScenarioLoader` | Đọc `Content/Scenarios/*.json` |
| `ARoboORGameState` | Chạy bộ máy trên máy chủ, đồng bộ tiến độ và lỗi tới mọi học viên trong phòng ảo |
| `UORActionComponent` | Gắn vào nhân vật học viên; mọi thao tác VR quy về `SubmitAction(Action, Target)` |
| `UHandSterilityComponent`, `USterileFieldComponent` | Phát hiện tay chưa vô khuẩn chạm vùng vô khuẩn bằng va chạm vật lý |
| `UXAPISubsystem` | Gửi câu lệnh xAPI (cùng cấu trúc bản Python), giữ lại và gửi lại khi lỗi mạng |
| `Private/Tests/ScenarioEngineTest.cpp` | Kiểm thử tự động trong Unreal, cùng ca với bản Python |

Các bước dựng (cần máy có Unreal Engine 5 và Visual Studio hoặc Rider):

1. Mở `ue5/RoboORSim.uproject`, chọn phiên bản Unreal 5.x đang cài; cho phép tạo lại project files.
2. Biên dịch. Lỗi biên dịch có thể phát sinh vì mã chưa được dựng thử; các điểm cần chú ý ở mục dưới.
3. Đặt GameState mặc định của GameMode là `ARoboORGameState`.
4. Thêm `UORActionComponent` vào Pawn học viên; đặt `Role` và `LearnerId` khi vào phòng.
5. Gắn `UHandSterilityComponent` vào socket bàn tay của nhân vật; đặt `USterileFieldComponent` lên khăn mổ,
   bàn dụng cụ, bàn Mayo; chỉnh Collision Profile để hai loại component Overlap nhau.
6. Trong Blueprint, nối thao tác tay cầm VR với `SubmitAction`, ví dụ chạm nút tháo trên tay robot → `("undock_arm", "arm1")`.
7. Chạy kiểm thử: Tools > Session Frontend > Automation, lọc `RoboOR`.
8. Chạy `uvicorn` như trên; dữ liệu từ Unreal sẽ hiện trên cùng bảng điều khiển.

Điểm có thể cần chỉnh khi biên dịch lần đầu:
- Cờ kiểm thử `EAutomationTestFlags` thay đổi giữa các bản 5.x; nếu báo lỗi, đổi theo bản đang dùng.
- Tên plugin MetaHuman và OpenXR theo bản engine; MetaHuman bật trong Edit > Plugins.

## Chưa làm (theo lộ trình trong tài liệu)

- [ ] Cảnh báo đứng quá gần vùng vô khuẩn trong bản Unreal (bản Python đã có)
- [ ] Nhân vật MetaHuman, quét 3D phòng mổ, ghi chuyển động ê kíp thật
- [ ] Blueprint tương tác VR cho từng thao tác; bản màn hình thường
- [ ] Nhận dạng giọng nói tiếng Việt cho câu giao tiếp bắt buộc
- [ ] Nhân vật ảo đóng vai bằng mô hình ngôn ngữ, giới hạn trong kịch bản đã duyệt
- [ ] Module 1, 4, 5 và bổ sung kịch bản module 6 (mất điện, ngừng tuần hoàn khi dốc đầu)
- [ ] Đồng bộ điểm sang Moodle; chuyển sang LRS đạt chuẩn
- [ ] Hội đồng chuyên môn duyệt toàn bộ kịch bản, đổi `approval.status` thành `approved`
