// Lop truy cap du lieu: node:sqlite (DatabaseSync) cho dev/test.
// Khi DB_CLIENT=mysql: su dung schema o database/schema.sql tren MySQL 8
// (API duoc thiet ke de thay lop nay bang mysql2 ma khong doi route).
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { toDateKey, addMinutes, formatSlotStart } from './slots.js';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS specialties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PATIENT','DOCTOR','ADMIN')),
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  doctor_id INTEGER REFERENCES doctors(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  specialty_id INTEGER NOT NULL REFERENCES specialties(id),
  title TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  consultation_fee INTEGER NOT NULL DEFAULT 200000,
  slot_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15,20,30,45,60)),
  years_experience INTEGER NOT NULL DEFAULT 1,
  room TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=CN, 1=T2 ... 6=T7
  start_time TEXT NOT NULL, -- 'HH:MM'
  end_time TEXT NOT NULL,
  UNIQUE (doctor_id, weekday, start_time)
);
CREATE TABLE IF NOT EXISTS doctor_time_off (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  reason TEXT DEFAULT '',
  UNIQUE (doctor_id, date)
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES users(id),
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  slot_start TEXT NOT NULL, -- 'YYYY-MM-DDTHH:MM'
  slot_end TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CONFIRMED','ARRIVED','COMPLETED','CANCELLED','NO_SHOW')),
  cancel_reason TEXT DEFAULT '',
  clinical_notes TEXT DEFAULT '',
  instructions TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Chong double-booking o tang DB: 1 bac si + 1 slot chi co 1 lich dang hoat dong.
-- (Lich da CANCELLED khong chiem slot nua nen dung partial index.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointment_slot
  ON appointments(doctor_id, slot_start) WHERE status <> 'CANCELLED';
CREATE TABLE IF NOT EXISTS slot_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES doctors(id),
  slot_start TEXT NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, -- ISO local 'YYYY-MM-DDTHH:MM:SS'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (doctor_id, slot_start)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_day ON appointments(doctor_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
`;

export function createDb(dbFile = config.dbFile) {
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  return db;
}

// ---------- Seed ----------
const SPECIALTIES = [
  ['Nội khoa', 'Khám và điều trị bệnh lý nội khoa tổng quát'],
  ['Nhi khoa', 'Chăm sóc sức khỏe trẻ em'],
  ['Da liễu', 'Bệnh da, dị ứng và thẩm mỹ da'],
  ['Tai Mũi Họng', 'Khám tai, mũi, họng và thanh quản'],
  ['Sản phụ khoa', 'Sức khỏe phụ nữ và thai sản'],
];
const DOCTORS = [
  // [ho ten, chuyen khoa idx, hoc vi, phi kham, slot phut, kinh nghiem, phong, lich: [weekday, start, end][]]
  ['Nguyễn Văn An', 0, 'BS.CKII', 250000, 30, 15, 'P.101', [[1, '08:00', '11:30'], [1, '13:30', '16:30'], [3, '08:00', '11:30'], [5, '08:00', '11:30']]],
  ['Trần Thị Bình', 0, 'ThS.BS', 220000, 30, 9, 'P.102', [[2, '08:00', '11:30'], [4, '08:00', '11:30'], [4, '13:30', '16:30'], [6, '08:00', '11:00']]],
  ['Lê Hoàng Cường', 1, 'BS.CKI', 200000, 20, 8, 'P.201', [[1, '08:00', '11:00'], [2, '08:00', '11:00'], [3, '13:30', '16:30'], [5, '08:00', '11:00']]],
  ['Phạm Thu Dung', 1, 'BS', 180000, 20, 5, 'P.202', [[2, '13:30', '16:30'], [3, '08:00', '11:00'], [4, '08:00', '11:00'], [6, '08:00', '11:00']]],
  ['Hoàng Minh Đức', 2, 'BS.CKI', 210000, 30, 11, 'P.301', [[1, '13:30', '16:30'], [3, '08:00', '11:30'], [5, '13:30', '16:30']]],
  ['Vũ Ngọc Hà', 3, 'ThS.BS', 230000, 30, 10, 'P.302', [[1, '08:00', '11:30'], [2, '13:30', '16:30'], [4, '08:00', '11:30'], [6, '08:00', '11:00']]],
  ['Đặng Thanh Hải', 3, 'BS', 190000, 30, 6, 'P.303', [[2, '08:00', '11:30'], [3, '13:30', '16:30'], [5, '08:00', '11:30']]],
  ['Bùi Phương Linh', 4, 'BS.CKII', 260000, 30, 14, 'P.401', [[1, '08:00', '11:30'], [3, '13:30', '16:30'], [4, '08:00', '11:30'], [6, '08:00', '11:00']]],
];
const PATIENTS = [
  ['patient@medibook.vn', 'Nguyễn Thị Mai', '0901000001'],
  ['patient2@medibook.vn', 'Trần Văn Nam', '0901000002'],
  ['patient3@medibook.vn', 'Lê Thị Hoa', '0901000003'],
];

function slugEmail(name) {
  const map = { 'Nguyễn Văn An': 'bs.an', 'Trần Thị Bình': 'bs.binh', 'Lê Hoàng Cường': 'bs.cuong', 'Phạm Thu Dung': 'bs.dung', 'Hoàng Minh Đức': 'bs.duc', 'Vũ Ngọc Hà': 'bs.ha', 'Đặng Thanh Hải': 'bs.hai', 'Bùi Phương Linh': 'bs.linh' };
  return `${map[name]}@medibook.vn`;
}

export function seedDb(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM specialties').get().c;
  if (count > 0) return;
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const insSpec = db.prepare('INSERT INTO specialties(name, description) VALUES (?,?)');
  const specIds = SPECIALTIES.map(([n, d]) => Number(insSpec.run(n, d).lastInsertRowid));

  const insDoc = db.prepare('INSERT INTO doctors(full_name, specialty_id, title, bio, consultation_fee, slot_minutes, years_experience, room) VALUES (?,?,?,?,?,?,?,?)');
  const insSch = db.prepare('INSERT INTO doctor_schedules(doctor_id, weekday, start_time, end_time) VALUES (?,?,?,?)');
  const insUser = db.prepare('INSERT INTO users(email, password_hash, role, full_name, phone, doctor_id) VALUES (?,?,?,?,?,?)');

  insUser.run('admin@medibook.vn', hash('Admin@123'), 'ADMIN', 'Quản trị viên MediBook', '0900000000', null);
  const doctorIds = [];
  for (const [name, specIdx, title, fee, slotMin, exp, room, schedules] of DOCTORS) {
    const did = Number(insDoc.run(name, specIds[specIdx], title, `Bác sĩ ${title} chuyên ngành ${SPECIALTIES[specIdx][0]}, ${exp} năm kinh nghiệm.`, fee, slotMin, exp, room).lastInsertRowid);
    doctorIds.push(did);
    for (const [wd, s, e] of schedules) insSch.run(did, wd, s, e);
    insUser.run(slugEmail(name), hash('Doctor@123'), 'DOCTOR', name, '090200000' + did, did);
  }
  const patientIds = PATIENTS.map(([email, name, phone]) =>
    Number(insUser.run(email, hash('Patient@123'), 'PATIENT', name, phone, null).lastInsertRowid));

  // Lich hen mau: tao tuong doi theo hom nay de luon co qua khu + tuong lai
  const insAppt = db.prepare(`INSERT INTO appointments(patient_id, doctor_id, slot_start, slot_end, reason, status, clinical_notes)
    VALUES (?,?,?,?,?,?,?)`);
  const today = new Date();
  const dayOffset = (base, days, hh, mm) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, hh, mm);
    return formatSlotStart(d);
  };
  const samples = [
    // patientIdx, doctorIdx, offset ngay, gio, phut, ly do, trang thai
    [0, 0, -3, 8, 0, 'Đau dạ dày tái phát', 'COMPLETED'],
    [0, 2, -1, 8, 0, 'Bé sốt nhẹ, ho', 'COMPLETED'],
    [1, 1, -2, 8, 30, 'Tái khám huyết áp', 'NO_SHOW'],
    [1, 5, 1, 8, 0, 'Viêm họng kéo dài', 'CONFIRMED'],
    [2, 7, 1, 8, 0, 'Khám thai định kỳ', 'PENDING'],
    [0, 4, 2, 13, 30, 'Nổi mẩn ngứa 2 tuần', 'PENDING'],
    [2, 0, -5, 8, 30, 'Kiểm tra sức khỏe tổng quát', 'CANCELLED'],
  ];
  for (const [p, dIdx, off, hh, mm, reason, status] of samples) {
    const did = doctorIds[dIdx];
    const slotMin = DOCTORS[dIdx][4];
    const start = dayOffset(today, off, hh, mm);
    const end = formatSlotStart(addMinutes(new Date(start.replace('T', ' ')), slotMin));
    insAppt.run(patientIds[p], did, start, end, reason, status, status === 'COMPLETED' ? 'Đã khám, kê đơn và hẹn tái khám khi cần.' : '');
  }
}
