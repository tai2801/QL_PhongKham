# TEST REPORT — MEDIBOOK CLINIC

Ngày chạy: 15/10/2023 · Môi trường: Windows 10, Node.js, SQLite (`node:sqlite`).

## 1. Backend tests — `npm test` → 18/18 PASS
```
✔ generateDaySlots: ca 08:00-11:30, slot 30p -> 7 slot
✔ isAlignedSlot: 08:15 khong dung luoi 30p, 08:30 dung
✔ canModifyAt: con 5h -> duoc, con 2h (han 4h) -> khong
✔ canTransition: PENDING->COMPLETED bi cam, PENDING->CONFIRMED duoc
✔ GET /health -> ok
✔ login sai mat khau -> 401
✔ register mat khau ngan -> 400, register hop le -> 201
✔ loc bac si theo chuyen khoa
✔ dat lich thanh cong -> 201 PENDING + co thong bao
✔ dat trung slot (benh nhan khac) -> 409
✔ giu slot tam: nguoi khac khong dat duoc, chu giu dat duoc
✔ dat ngoai gio lam viec (chu nhat, bac si 1 khong lam) -> 422
✔ dat slot khong dung luoi (08:15 voi slot 30p) -> 422
✔ bac si chuyen trang thai: PENDING->COMPLETED bi chan 422, dung trinh tu thi duoc
✔ huy lich con xa -> 200; huy qua han (<4h) -> 422 TOO_LATE_TO_CANCEL
✔ benh nhan thuong khong vao duoc API admin -> 403
✔ admin danh dau bac si nghi dot xuat: lich bi huy + co goi y thay the
✔ admin reports co du lieu theo trang thai + chuyen khoa
ℹ tests 18 · pass 18 · fail 0
```

## 2. Kiểm thử tích hợp API — PASS
Chạy server backend ở cổng 4000 và kiểm tra các luồng chính:
- `GET /health` → `{"status":"ok","service":"medibook-api","dbClient":"sqlite"}`
- Đăng nhập bệnh nhân mẫu → nhận JWT hợp lệ.
- `GET /api/doctors?specialtyId=2` → trả về danh sách bác sĩ Nhi khoa.
- Đặt slot trống `2023-10-16T08:00` (BS Nguyễn Văn An) → HTTP 201, trạng thái `PENDING`.
- Đặt trùng đúng slot đó bằng tài khoản khác → **HTTP 409 Conflict**.

## 3. Frontend build — PASS
```
npm run build  (tsc -b && vite build)
✓ 35 modules transformed
dist/assets/index-*.js  169.16 kB (gzip 53.23 kB)
✓ built in 3.20s
```
