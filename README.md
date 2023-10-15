# MediBook Clinic — Hệ thống đặt lịch khám phòng khám tư nhân

Nhóm 2 · Môn Thực hành Phân tích & Thiết kế Hệ thống Thông tin · HUIT

Nền tảng đặt lịch khám ưu tiên trải nghiệm người bệnh: slot tự sinh từ lịch làm việc của bác sĩ, giữ slot tạm khi đang đặt, quy tắc hủy/đổi lịch rõ ràng và gợi ý lịch thay thế khi bác sĩ nghỉ đột xuất.

## Công nghệ
- **Frontend:** React + TypeScript + Vite + Tailwind CSS 4
- **Backend:** Node.js + Express + JWT (jsonwebtoken) + bcryptjs
- **Database:** SQLite (qua `node:sqlite`) cho dev/test — mặc định; **MySQL 8** cho triển khai với schema tại `database/schema.sql`

## Tính năng chính
**Bệnh nhân:** đăng ký/đăng nhập, tìm + lọc bác sĩ theo chuyên khoa, xem hồ sơ & lịch làm việc, đặt lịch từng bước (chuyên khoa → bác sĩ → ngày → slot), giữ slot tạm 10 phút, hủy/đổi lịch (còn ≥ 4 giờ trước giờ khám), lịch sử khám + kết luận, thông báo trong hệ thống, gợi ý slot thay thế khi lịch bị hủy.

**Bác sĩ:** xem lịch theo ngày, xác nhận → đã đến → hoàn tất, ghi nội dung khám & chỉ định, đánh dấu không đến.

**Admin:** CRUD chuyên khoa/bác sĩ/giờ làm việc, khóa tài khoản, đánh dấu bác sĩ nghỉ đột xuất (tự hủy lịch bị ảnh hưởng + thông báo), báo cáo lượt khám theo trạng thái/chuyên khoa/bác sĩ.

**Chống trùng lịch 2 lớp:** kiểm tra ở API + ràng buộc UNIQUE ở DB (partial index với SQLite, generated column với MySQL).

## Chạy local
Yêu cầu: Node.js ≥ 22 (khuyến nghị 24).

```bash
# Backend (cổng 4000)
cd backend
npm install
npm start            # tự tạo schema + seed khi khởi động lần đầu
npm test             # 18 test (unit + API)

# Frontend (cổng 5173, proxy /api sang backend)
cd frontend
npm install
npm run dev          # mở http://localhost:5173
npm run build        # kiểm tra build production
```

Dữ liệu bền vững: đặt `DB_FILE=./medibook.db` khi chạy backend để lưu SQLite xuống file (mặc định `:memory:` — mất khi tắt server, phù hợp test).

## Tài khoản mẫu (seed)
| Vai trò | Email | Mật khẩu |
|---|---|---|
| Admin | admin@medibook.vn | Admin@123 |
| Bác sĩ | bs.an@medibook.vn (và bs.binh, bs.cuong, bs.dung, bs.duc, bs.ha, bs.hai, bs.linh @medibook.vn) | Doctor@123 |
| Bệnh nhân | patient@medibook.vn (patient2, patient3) | Patient@123 |

Seed gồm 5 chuyên khoa, 8 bác sĩ kèm lịch làm việc tuần, 7 lịch hẹn mẫu ở nhiều trạng thái.

## Cấu hình (backend/.env — xem .env.example)
`PORT`, `DB_CLIENT` (`sqlite` mặc định), `DB_FILE`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `SLOT_HOLD_MINUTES` (10), `CANCEL_MIN_HOURS` (4).

## Dùng với MySQL
1. Tạo DB bằng `database/schema.sql`, nạp `database/seed.sql` (danh mục + bác sĩ + lịch).
2. Schema MySQL có cấu trúc bảng/cột tương ứng 1-1 với bản SQLite trong `backend/src/db.js`, thuận tiện chuyển đổi khi triển khai thực tế.

## Tài liệu
- `docs/BUSINESS_ANALYSIS.md` — actors, use cases, business rules, luồng chính/ngoại lệ
- `docs/ARCHITECTURE.md` — kiến trúc và quyết định kỹ thuật
- `docs/ERD.md` — sơ đồ thực thể (Mermaid)
- `docs/API.md` — danh sách endpoints
- `docs/TEST_REPORT.md` — kết quả chạy kiểm thử

## Giấy phép
MIT License — Nhóm 2 HUIT (2023).
