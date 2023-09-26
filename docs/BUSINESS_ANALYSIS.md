# PHÂN TÍCH NGHIỆP VỤ — MEDIBOOK CLINIC

> Hệ thống đặt lịch khám và quản lý lịch làm việc bác sĩ cho phòng khám đa khoa tư nhân.

## 1. Actors
| Actor | Mô tả |
|---|---|
| Bệnh nhân | Người dân đặt lịch khám online |
| Bác sĩ | Người khám, cập nhật trạng thái và nội dung khám |
| Quản trị viên (Admin) | Quản lý danh mục, lịch làm việc, ngày nghỉ, báo cáo |
| Hệ thống | Tự sinh slot, giữ slot tạm, gửi thông báo trong hệ thống |

## 2. Use Cases chính
- UC01 Đăng ký / đăng nhập (JWT, mật khẩu băm bcrypt)
- UC02 Tìm và lọc bác sĩ theo chuyên khoa / tên
- UC03 Xem hồ sơ bác sĩ và lịch làm việc tuần
- UC04 Đặt lịch từng bước: chuyên khoa → bác sĩ → ngày → slot → lý do
- UC05 Giữ slot tạm trong lúc xác nhận đặt lịch
- UC06 Hủy / đổi lịch theo hạn cấu hình
- UC07 Bác sĩ xử lý lịch trong ngày (xác nhận → đã đến → hoàn tất + ghi nội dung khám/chỉ định)
- UC08 Admin CRUD chuyên khoa / bác sĩ / giờ làm việc
- UC09 Admin đánh dấu bác sĩ nghỉ đột xuất → hủy lịch bị ảnh hưởng + gợi ý lịch thay thế
- UC10 Báo cáo lượt khám (theo trạng thái / chuyên khoa / bác sĩ)
- UC11 Nhận thông báo trong hệ thống (không gửi email thật)

## 3. Business Rules
- BR01: Slot tự sinh từ lịch làm việc của bác sĩ theo thời lượng slot riêng của từng bác sĩ (15/20/30/45/60 phút).
- BR02: Một bác sĩ + một slot chỉ có tối đa 1 lịch đang hoạt động — ràng buộc UNIQUE ở tầng DB (partial index ở SQLite, generated column ở MySQL).
- BR03: Slot đang được bệnh nhân khác giữ tạm (mặc định 10 phút) không đặt được; hết hạn giữ thì tự nhả.
- BR04: Không đặt lịch ngoài giờ làm việc, vào ngày bác sĩ nghỉ, hoặc trong quá khứ.
- BR05: Hủy/đổi lịch chỉ khi còn ít nhất `CANCEL_MIN_HOURS` giờ (mặc định 4 giờ) trước giờ khám; admin được hủy bất cứ lúc nào.
- BR06: Máy trạng thái lịch hẹn: PENDING → CONFIRMED → ARRIVED → COMPLETED; PENDING/CONFIRMED → CANCELLED / NO_SHOW. Không nhảy cóc trạng thái.
- BR07: Khi bác sĩ nghỉ đột xuất, mọi lịch PENDING/CONFIRMED ngày đó bị hủy kèm lý do, bệnh nhân nhận thông báo và được gợi ý slot thay thế cùng chuyên khoa trong 7 ngày.
- BR08: Nội dung khám và chỉ định chỉ ghi khi hoàn tất lịch; bệnh nhân xem được kết luận của chính mình.
- BR09: Phân quyền 3 vai trò ở middleware: bệnh nhân chỉ thao tác lịch của mình; bác sĩ chỉ lịch được phân công; admin toàn quyền quản trị.

## 4. Luồng chính (đặt lịch)
1. Bệnh nhân chọn chuyên khoa → bác sĩ → ngày: hệ thống sinh slot và đánh dấu free/booked/held/past.
2. Chọn slot → nhập lý do → bấm xác nhận: hệ thống tạo giữ slot tạm, sau đó tạo lịch trong transaction logic, xung đột đồng thời bị DB từ chối (409).
3. Hệ thống tạo thông báo cho bệnh nhân và bác sĩ.

## 5. Luồng thay thế / ngoại lệ
- Slot vừa bị người khác lấy: trả 409 kèm thông báo, bệnh nhân chọn slot khác.
- Hủy quá hạn: trả 422 `TOO_LATE_TO_CANCEL`, gợi ý liên hệ phòng khám (admin hủy hộ).
- Bác sĩ nghỉ đột xuất: lịch bị hủy tự động; bệnh nhân mở "Gợi ý lịch thay thế" để xem slot cùng chuyên khoa.
- Token hết hạn / sai vai trò: 401 / 403.

## 6. Điểm nổi bật của hệ thống
1. Quy trình đặt lịch từng bước có cơ chế giữ slot tạm 10 phút tránh trùng lặp.
2. Quy tắc hủy/đổi theo thời hạn cấu hình linh hoạt bằng biến môi trường.
3. Xử lý bác sĩ nghỉ đột xuất kèm gợi ý slot khám thay thế tự động.
4. Slot có thời lượng riêng theo từng bác sĩ (20 phút cho Nhi, 30 phút cho Nội…).
5. 3 dashboard tách bạch theo vai trò; thông báo lưu DB và hiển thị trực tiếp trong ứng dụng.
