# KIẾN TRÚC — MEDIBOOK CLINIC

## Tổng quan
```
[React TS + Tailwind (Vite)]  --REST/JWT-->  [Express API]  -->  [DB layer]
                                                              ├─ SQLite (node:sqlite) — dev/test, mặc định
                                                              └─ MySQL 8 — production, schema ở database/schema.sql
```

## Backend (`backend/src/`)
| File | Vai trò |
|---|---|
| `config.js` | Đọc biến môi trường: PORT, DB_CLIENT, JWT, SLOT_HOLD_MINUTES, CANCEL_MIN_HOURS |
| `slots.js` | Hàm thuần: sinh slot, kiểm tra lưới slot, hạn hủy/đổi, máy trạng thái — unit test trực tiếp |
| `db.js` | Tạo schema SQLite + seed (dữ liệu mẫu sinh tương đối theo ngày hiện tại để luôn có lịch quá khứ/tương lai) |
| `app.js` | Toàn bộ routes + middleware auth/phân quyền; nhận `dbFile` để test dùng DB in-memory |
| `server.js` | Khởi động server |

## Quyết định kỹ thuật quan trọng
- **Chống double-booking ở tầng DB**, không chỉ ở code: SQLite dùng partial UNIQUE index `WHERE status <> 'CANCELLED'`; MySQL dùng cột GENERATED `slot_key` (NULL khi đã hủy) + UNIQUE. Route còn bọc try/catch để biến lỗi UNIQUE thành HTTP 409 thân thiện.
- **Giữ slot tạm**: bảng `slot_holds` UNIQUE(doctor_id, slot_start), `expires_at` được dọn lười (lazy purge) mỗi lần kiểm tra trạng thái slot.
- **Thời gian dạng "local naive"** `YYYY-MM-DDTHH:MM` cho slot để tránh lệch múi giờ trong môi trường học tập; ghi rõ đây là giới hạn, production nên chuẩn hóa UTC.
- **Thông báo lưu DB** (`notifications`) thay vì gửi email thật.

## Frontend (`frontend/src/`)
- `api.ts`: lớp gọi API + kiểu dữ liệu + định dạng hiển thị dùng chung.
- `pages/PublicPages.tsx`: tìm bác sĩ, hồ sơ bác sĩ.
- `pages/BookingPage.tsx`: wizard đặt lịch 5 bước.
- `pages/Dashboards.tsx`: dashboard bệnh nhân / bác sĩ / admin.
- Điều hướng bằng state (không dùng router ngoài) để giảm phụ thuộc; JWT lưu localStorage.

## Bảo mật
- Mật khẩu băm bcrypt (bcryptjs), không lưu plaintext; JWT ký bằng `JWT_SECRET` từ env.
- Mọi truy vấn dùng tham số hóa (prepared statements) — chống SQL injection.
- Phân quyền kiểm tra ở middleware cho từng nhóm route.
