-- MediBook Clinic - Seed MySQL (rut gon; ban seed day du va linh hoat theo
-- ngay hien tai nam o backend/src/db.js - ham seedDb, tu chay khi khoi dong
-- voi SQLite. File nay dung khi muon nap du lieu mau truc tiep bang MySQL.)
USE medibook;

INSERT INTO specialties (name, description) VALUES
('Nội khoa', 'Khám và điều trị bệnh lý nội khoa tổng quát'),
('Nhi khoa', 'Chăm sóc sức khỏe trẻ em'),
('Da liễu', 'Bệnh da, dị ứng và thẩm mỹ da'),
('Tai Mũi Họng', 'Khám tai, mũi, họng và thanh quản'),
('Sản phụ khoa', 'Sức khỏe phụ nữ và thai sản');

-- Mat khau mau (bcrypt): Admin@123 / Doctor@123 / Patient@123
-- Hash duoc tao bang backend khi seed qua SQLite; voi MySQL hay dung chuc nang
-- dang ky + trang admin de tao tai khoan, hoac chay backend voi DB_CLIENT=mysql
-- sau khi lop truy cap mysql2 duoc noi (xem README - muc Gioi han).
INSERT INTO doctors (full_name, specialty_id, title, consultation_fee, slot_minutes, years_experience, room) VALUES
('Nguyễn Văn An', 1, 'BS.CKII', 250000, 30, 15, 'P.101'),
('Trần Thị Bình', 1, 'ThS.BS', 220000, 30, 9, 'P.102'),
('Lê Hoàng Cường', 2, 'BS.CKI', 200000, 20, 8, 'P.201'),
('Phạm Thu Dung', 2, 'BS', 180000, 20, 5, 'P.202'),
('Hoàng Minh Đức', 3, 'BS.CKI', 210000, 30, 11, 'P.301'),
('Vũ Ngọc Hà', 4, 'ThS.BS', 230000, 30, 10, 'P.302'),
('Đặng Thanh Hải', 4, 'BS', 190000, 30, 6, 'P.303'),
('Bùi Phương Linh', 5, 'BS.CKII', 260000, 30, 14, 'P.401');

INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES
(1, 1, '08:00', '11:30'), (1, 1, '13:30', '16:30'), (1, 3, '08:00', '11:30'), (1, 5, '08:00', '11:30'),
(2, 2, '08:00', '11:30'), (2, 4, '08:00', '11:30'), (2, 4, '13:30', '16:30'), (2, 6, '08:00', '11:00'),
(3, 1, '08:00', '11:00'), (3, 2, '08:00', '11:00'), (3, 3, '13:30', '16:30'), (3, 5, '08:00', '11:00'),
(4, 2, '13:30', '16:30'), (4, 3, '08:00', '11:00'), (4, 4, '08:00', '11:00'), (4, 6, '08:00', '11:00'),
(5, 1, '13:30', '16:30'), (5, 3, '08:00', '11:30'), (5, 5, '13:30', '16:30'),
(6, 1, '08:00', '11:30'), (6, 2, '13:30', '16:30'), (6, 4, '08:00', '11:30'), (6, 6, '08:00', '11:00'),
(7, 2, '08:00', '11:30'), (7, 3, '13:30', '16:30'), (7, 5, '08:00', '11:30'),
(8, 1, '08:00', '11:30'), (8, 3, '13:30', '16:30'), (8, 4, '08:00', '11:30'), (8, 6, '08:00', '11:00');
