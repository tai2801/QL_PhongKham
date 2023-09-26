# API — MEDIBOOK CLINIC

Base: `http://localhost:4000`. Trừ health/specialties/doctors/slots, mọi endpoint cần `Authorization: Bearer <JWT>`.

## Chung
| Method | Endpoint | Quyền | Mô tả |
|---|---|---|---|
| GET | /health | công khai | Trạng thái API |
| POST | /api/auth/register | công khai | Đăng ký bệnh nhân (mật khẩu ≥ 8 ký tự) |
| POST | /api/auth/login | công khai | Đăng nhập, trả JWT |
| GET | /api/specialties | công khai | Chuyên khoa + số bác sĩ |
| GET | /api/doctors?specialtyId=&q= | công khai | Tìm/lọc bác sĩ |
| GET | /api/doctors/:id | công khai | Hồ sơ + lịch tuần + ngày nghỉ |
| GET | /api/doctors/:id/slots?date=YYYY-MM-DD | công khai | Slot trong ngày kèm trạng thái free/booked/held/past |

## Bệnh nhân
| Method | Endpoint | Mô tả / lỗi đặc trưng |
|---|---|---|
| POST | /api/appointments/hold | Giữ slot tạm 10 phút → 409 nếu slot đã bị giữ/đặt |
| POST | /api/appointments | Tạo lịch → 201; 409 trùng slot; 422 ngoài giờ/ngày nghỉ/quá khứ/lệch lưới slot |
| GET | /api/appointments/mine | Lịch sử lịch hẹn của tôi |
| PATCH | /api/appointments/:id/cancel | Hủy lịch → 422 `TOO_LATE_TO_CANCEL` nếu còn < 4 giờ |
| PATCH | /api/appointments/:id/reschedule | Đổi lịch (cùng quy tắc hạn + kiểm tra slot mới) |
| GET | /api/appointments/:id/alternatives | Gợi ý slot thay thế cùng chuyên khoa trong 7 ngày |
| GET | /api/notifications | Thông báo của tôi |
| PATCH | /api/notifications/:id/read | Đánh dấu đã đọc |

## Bác sĩ
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | /api/doctor/appointments?date= | Lịch theo ngày của bác sĩ đang đăng nhập |
| PATCH | /api/doctor/appointments/:id/status | Chuyển trạng thái theo máy trạng thái; COMPLETED kèm clinicalNotes/instructions → 422 nếu nhảy cóc |

## Admin
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | /api/admin/users | Danh sách người dùng |
| PATCH | /api/admin/users/:id/active | Khóa/mở tài khoản |
| POST | /api/admin/specialties | Thêm chuyên khoa |
| POST | /api/admin/doctors | Thêm bác sĩ |
| PUT | /api/admin/doctors/:id/schedules | Thay toàn bộ lịch làm việc tuần của bác sĩ |
| POST | /api/admin/doctors/:id/time-off | Đánh dấu nghỉ đột xuất → hủy lịch bị ảnh hưởng + thông báo; trả số lịch bị ảnh hưởng |
| GET | /api/admin/appointments | 200 lịch gần nhất |
| GET | /api/admin/reports | Lượt khám theo trạng thái / chuyên khoa / bác sĩ + tổng bệnh nhân |

Mã lỗi chuẩn: `{ "error": "<CODE>", "message": "<tiếng Việt>" }` với HTTP 400/401/403/404/409/422.
