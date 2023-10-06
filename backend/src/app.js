import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { createDb, seedDb } from './db.js';
import {
  generateDaySlots, isAlignedSlot, parseSlotStart, canModifyAt, canTransition,
  toDateKey, formatSlotStart,
} from './slots.js';

export function createApp(dbFile = config.dbFile) {
  const db = createDb(dbFile);
  seedDb(db);
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.locals.db = db;

  const notify = (userId, type, title, body) =>
    db.prepare('INSERT INTO notifications(user_id, type, title, body) VALUES (?,?,?,?)').run(userId, type, title, body);
  const doctorUserId = (doctorId) => {
    const r = db.prepare('SELECT id FROM users WHERE doctor_id = ?').get(doctorId);
    return r ? r.id : null;
  };
  const err = (res, status, code, message) => res.status(status).json({ error: code, message });

  // ---------- Auth ----------
  function auth(req, res, next) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return err(res, 401, 'UNAUTHORIZED', 'Thiếu token đăng nhập');
    try {
      const payload = jwt.verify(h.slice(7), config.jwtSecret);
      const user = db.prepare('SELECT id, email, role, full_name, phone, doctor_id, is_active FROM users WHERE id = ?').get(payload.sub);
      if (!user || !user.is_active) return err(res, 401, 'UNAUTHORIZED', 'Tài khoản không hợp lệ hoặc đã bị khóa');
      req.user = user;
      next();
    } catch {
      return err(res, 401, 'UNAUTHORIZED', 'Token hết hạn hoặc không hợp lệ');
    }
  }
  const requireRole = (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : err(res, 403, 'FORBIDDEN', 'Không có quyền thực hiện thao tác này');

  // ---------- Helpers ----------
  function schedulesOf(doctorId, weekday) {
    return db.prepare('SELECT start_time, end_time FROM doctor_schedules WHERE doctor_id = ? AND weekday = ? ORDER BY start_time')
      .all(doctorId, weekday);
  }
  function isTimeOff(doctorId, dateKey) {
    return !!db.prepare('SELECT id FROM doctor_time_off WHERE doctor_id = ? AND date = ?').get(doctorId, dateKey);
  }
  function purgeExpiredHolds() {
    db.prepare("DELETE FROM slot_holds WHERE expires_at <= ?").run(new Date().toISOString());
  }
  function slotState(doctorId, slotStart, forPatientId = null) {
    // Tra ve 'booked' | 'held' | 'free'
    const appt = db.prepare("SELECT id FROM appointments WHERE doctor_id = ? AND slot_start = ? AND status <> 'CANCELLED'").get(doctorId, slotStart);
    if (appt) return 'booked';
    purgeExpiredHolds();
    const hold = db.prepare('SELECT patient_id FROM slot_holds WHERE doctor_id = ? AND slot_start = ?').get(doctorId, slotStart);
    if (hold && hold.patient_id !== forPatientId) return 'held';
    return 'free';
  }
  function validateBookableSlot(doctor, slotStart) {
    // Tra ve {ok:true, slotEnd} hoac {ok:false, code, message}
    const start = parseSlotStart(slotStart);
    if (Number.isNaN(start.getTime())) return { ok: false, code: 'INVALID_SLOT', message: 'Định dạng slot không hợp lệ' };
    if (start <= new Date()) return { ok: false, code: 'SLOT_IN_PAST', message: 'Không thể đặt slot trong quá khứ' };
    const dateKey = slotStart.slice(0, 10);
    if (isTimeOff(doctor.id, dateKey)) return { ok: false, code: 'DOCTOR_OFF', message: 'Bác sĩ nghỉ vào ngày này' };
    const schedules = schedulesOf(doctor.id, start.getDay());
    if (schedules.length === 0) return { ok: false, code: 'NOT_WORKING', message: 'Bác sĩ không làm việc vào ngày này' };
    if (!isAlignedSlot(dateKey, schedules, doctor.slot_minutes, slotStart))
      return { ok: false, code: 'OUTSIDE_HOURS', message: 'Slot nằm ngoài giờ làm việc hoặc không đúng lưới slot' };
    const slots = generateDaySlots(dateKey, schedules, doctor.slot_minutes);
    const found = slots.find((s) => s.slotStart === slotStart);
    return { ok: true, slotEnd: found.slotEnd };
  }
  function findAlternatives(doctor, fromSlotStart, limit = 8) {
    const peers = db.prepare('SELECT * FROM doctors WHERE specialty_id = ? ORDER BY (id = ?) ASC, id ASC')
      .all(doctor.specialty_id, doctor.id);
    const out = [];
    const base = parseSlotStart(fromSlotStart);
    for (let dayOff = 0; dayOff < 7 && out.length < limit; dayOff++) {
      const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOff);
      const dateKey = toDateKey(day);
      for (const peer of peers) {
        if (isTimeOff(peer.id, dateKey)) continue;
        const schedules = schedulesOf(peer.id, day.getDay());
        for (const s of generateDaySlots(dateKey, schedules, peer.slot_minutes)) {
          if (s.slotStart <= fromSlotStart) continue;
          if (parseSlotStart(s.slotStart) <= new Date()) continue;
          if (slotState(peer.id, s.slotStart) !== 'free') continue;
          out.push({ doctorId: peer.id, doctorName: peer.full_name, slotStart: s.slotStart, slotEnd: s.slotEnd });
          if (out.length >= limit) break;
        }
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // ---------- Public ----------
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'medibook-api', dbClient: config.dbClient, time: new Date().toISOString() }));

  app.post('/api/auth/register', (req, res) => {
    const { email, password, fullName, phone } = req.body || {};
    if (!email || !password || !fullName) return err(res, 400, 'VALIDATION', 'Thiếu email, mật khẩu hoặc họ tên');
    if (String(password).length < 8) return err(res, 400, 'VALIDATION', 'Mật khẩu tối thiểu 8 ký tự');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return err(res, 409, 'EMAIL_EXISTS', 'Email đã được đăng ký');
    const hash = bcrypt.hashSync(password, 10);
    const id = Number(db.prepare("INSERT INTO users(email, password_hash, role, full_name, phone) VALUES (?,?, 'PATIENT', ?, ?)")
      .run(email, hash, fullName, phone || '').lastInsertRowid);
    const token = jwt.sign({ sub: id, role: 'PATIENT' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.status(201).json({ token, user: { id, email, role: 'PATIENT', fullName } });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email || '');
    if (!user || !bcrypt.compareSync(password || '', user.password_hash))
      return err(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
    if (!user.is_active) return err(res, 403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khóa');
    const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name, doctorId: user.doctor_id } });
  });

  app.get('/api/specialties', (req, res) => {
    const rows = db.prepare(`SELECT s.*, COUNT(d.id) AS doctor_count FROM specialties s
      LEFT JOIN doctors d ON d.specialty_id = s.id GROUP BY s.id ORDER BY s.id`).all();
    res.json(rows);
  });

  app.get('/api/doctors', (req, res) => {
    const { specialtyId, q } = req.query;
    let sql = `SELECT d.*, s.name AS specialty_name FROM doctors d JOIN specialties s ON s.id = d.specialty_id WHERE 1=1`;
    const params = [];
    if (specialtyId) { sql += ' AND d.specialty_id = ?'; params.push(Number(specialtyId)); }
    if (q) { sql += ' AND d.full_name LIKE ?'; params.push(`%${q}%`); }
    sql += ' ORDER BY d.id';
    res.json(db.prepare(sql).all(...params));
  });

  app.get('/api/doctors/:id', (req, res) => {
    const doc = db.prepare(`SELECT d.*, s.name AS specialty_name FROM doctors d JOIN specialties s ON s.id = d.specialty_id WHERE d.id = ?`).get(Number(req.params.id));
    if (!doc) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy bác sĩ');
    const schedules = db.prepare('SELECT weekday, start_time, end_time FROM doctor_schedules WHERE doctor_id = ? ORDER BY weekday, start_time').all(doc.id);
    const timeOff = db.prepare('SELECT date, reason FROM doctor_time_off WHERE doctor_id = ? AND date >= date(\'now\') ORDER BY date').all(doc.id);
    res.json({ ...doc, schedules, timeOff });
  });

  app.get('/api/doctors/:id/slots', (req, res) => {
    const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(Number(req.params.id));
    if (!doc) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy bác sĩ');
    const dateKey = req.query.date;
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return err(res, 400, 'VALIDATION', 'Thiếu tham số date dạng YYYY-MM-DD');
    if (isTimeOff(doc.id, dateKey)) return res.json({ date: dateKey, timeOff: true, slots: [] });
    const weekday = parseSlotStart(`${dateKey}T00:00`).getDay();
    const schedules = schedulesOf(doc.id, weekday);
    const now = new Date();
    const slots = generateDaySlots(dateKey, schedules, doc.slot_minutes).map((s) => {
      let state = slotState(doc.id, s.slotStart, req.query.patientId ? Number(req.query.patientId) : null);
      if (parseSlotStart(s.slotStart) <= now) state = 'past';
      return { ...s, state };
    });
    res.json({ date: dateKey, timeOff: false, slots });
  });

  // ---------- Patient: holds + appointments ----------
  app.post('/api/appointments/hold', auth, requireRole('PATIENT'), (req, res) => {
    const { doctorId, slotStart } = req.body || {};
    const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(Number(doctorId));
    if (!doc) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy bác sĩ');
    const v = validateBookableSlot(doc, slotStart);
    if (!v.ok) return err(res, 422, v.code, v.message);
    if (slotState(doc.id, slotStart, req.user.id) !== 'free')
      return err(res, 409, 'SLOT_TAKEN', 'Slot vừa bị giữ hoặc đã có người đặt');
    const expires = new Date(Date.now() + config.slotHoldMinutes * 60000);
    try {
      db.prepare('INSERT INTO slot_holds(doctor_id, slot_start, patient_id, expires_at) VALUES (?,?,?,?)')
        .run(doc.id, slotStart, req.user.id, expires.toISOString());
    } catch {
      return err(res, 409, 'SLOT_TAKEN', 'Slot vừa bị giữ bởi bệnh nhân khác');
    }
    res.status(201).json({ holdMinutes: config.slotHoldMinutes, expiresAt: expires.toISOString(), slotStart, slotEnd: v.slotEnd });
  });

  app.post('/api/appointments', auth, requireRole('PATIENT'), (req, res) => {
    const { doctorId, slotStart, reason } = req.body || {};
    const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(Number(doctorId));
    if (!doc) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy bác sĩ');
    const v = validateBookableSlot(doc, slotStart);
    if (!v.ok) return err(res, 422, v.code, v.message);
    if (slotState(doc.id, slotStart, req.user.id) !== 'free')
      return err(res, 409, 'SLOT_TAKEN', 'Slot đã có người đặt');
    let id;
    try {
      id = Number(db.prepare('INSERT INTO appointments(patient_id, doctor_id, slot_start, slot_end, reason) VALUES (?,?,?,?,?)')
        .run(req.user.id, doc.id, slotStart, v.slotEnd, reason || '').lastInsertRowid);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return err(res, 409, 'SLOT_TAKEN', 'Slot đã có người đặt (xung đột đồng thời)');
      throw e;
    }
    db.prepare('DELETE FROM slot_holds WHERE doctor_id = ? AND slot_start = ? AND patient_id = ?').run(doc.id, slotStart, req.user.id);
    notify(req.user.id, 'APPOINTMENT_CREATED', 'Đặt lịch thành công', `Bạn đã đặt lịch với ${doc.full_name} lúc ${slotStart}. Phòng khám sẽ xác nhận sớm.`);
    const du = doctorUserId(doc.id);
    if (du) notify(du, 'NEW_APPOINTMENT', 'Có lịch hẹn mới', `Bệnh nhân ${req.user.full_name} đặt lịch lúc ${slotStart}.`);
    res.status(201).json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id));
  });

  const apptView = (a) => {
    const doc = db.prepare('SELECT full_name, specialty_id FROM doctors WHERE id = ?').get(a.doctor_id);
    const pat = db.prepare('SELECT full_name, phone FROM users WHERE id = ?').get(a.patient_id);
    return { ...a, doctor_name: doc?.full_name, patient_name: pat?.full_name, patient_phone: pat?.phone };
  };

  app.get('/api/appointments/mine', auth, requireRole('PATIENT'), (req, res) => {
    const rows = db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY slot_start DESC').all(req.user.id);
    res.json(rows.map(apptView));
  });

  app.patch('/api/appointments/:id/cancel', auth, (req, res) => {
    const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(req.params.id));
    if (!a) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy lịch hẹn');
    const isOwner = a.patient_id === req.user.id;
    if (!isOwner && req.user.role !== 'ADMIN') return err(res, 403, 'FORBIDDEN', 'Không phải lịch hẹn của bạn');
    if (!['PENDING', 'CONFIRMED'].includes(a.status)) return err(res, 422, 'INVALID_STATE', `Không thể hủy lịch ở trạng thái ${a.status}`);
    if (req.user.role !== 'ADMIN' && !canModifyAt(a.slot_start, new Date(), config.cancelMinHours))
      return err(res, 422, 'TOO_LATE_TO_CANCEL', `Chỉ được hủy khi còn ít nhất ${config.cancelMinHours} giờ trước giờ khám`);
    db.prepare("UPDATE appointments SET status = 'CANCELLED', cancel_reason = ?, updated_at = datetime('now') WHERE id = ?")
      .run(req.body?.reason || 'Bệnh nhân hủy', a.id);
    notify(a.patient_id, 'APPOINTMENT_CANCELLED', 'Đã hủy lịch hẹn', `Lịch lúc ${a.slot_start} đã được hủy.`);
    res.json({ ...a, status: 'CANCELLED' });
  });

  app.patch('/api/appointments/:id/reschedule', auth, requireRole('PATIENT'), (req, res) => {
    const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(req.params.id));
    if (!a) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy lịch hẹn');
    if (a.patient_id !== req.user.id) return err(res, 403, 'FORBIDDEN', 'Không phải lịch hẹn của bạn');
    if (!['PENDING', 'CONFIRMED'].includes(a.status)) return err(res, 422, 'INVALID_STATE', `Không thể đổi lịch ở trạng thái ${a.status}`);
    if (!canModifyAt(a.slot_start, new Date(), config.cancelMinHours))
      return err(res, 422, 'TOO_LATE_TO_RESCHEDULE', `Chỉ được đổi lịch khi còn ít nhất ${config.cancelMinHours} giờ trước giờ khám`);
    const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(a.doctor_id);
    const { newSlotStart } = req.body || {};
    const v = validateBookableSlot(doc, newSlotStart);
    if (!v.ok) return err(res, 422, v.code, v.message);
    if (slotState(doc.id, newSlotStart, req.user.id) !== 'free') return err(res, 409, 'SLOT_TAKEN', 'Slot mới đã có người đặt');
    try {
      db.prepare("UPDATE appointments SET slot_start = ?, slot_end = ?, status = 'PENDING', updated_at = datetime('now') WHERE id = ?")
        .run(newSlotStart, v.slotEnd, a.id);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return err(res, 409, 'SLOT_TAKEN', 'Slot mới đã có người đặt');
      throw e;
    }
    notify(req.user.id, 'APPOINTMENT_RESCHEDULED', 'Đã đổi lịch hẹn', `Lịch của bạn đã chuyển sang ${newSlotStart}.`);
    res.json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(a.id));
  });

  app.get('/api/appointments/:id/alternatives', auth, (req, res) => {
    const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(req.params.id));
    if (!a) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy lịch hẹn');
    const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(a.doctor_id);
    res.json({ original: { doctorId: a.doctor_id, slotStart: a.slot_start }, alternatives: findAlternatives(doc, a.slot_start) });
  });

  app.get('/api/notifications', auth, (req, res) => {
    res.json(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id));
  });
  app.patch('/api/notifications/:id/read', auth, (req, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });

  // ---------- Doctor ----------
  app.get('/api/doctor/appointments', auth, requireRole('DOCTOR'), (req, res) => {
    const date = req.query.date || toDateKey(new Date());
    const rows = db.prepare("SELECT * FROM appointments WHERE doctor_id = ? AND substr(slot_start,1,10) = ? ORDER BY slot_start")
      .all(req.user.doctor_id, date);
    res.json(rows.map(apptView));
  });
  app.patch('/api/doctor/appointments/:id/status', auth, requireRole('DOCTOR'), (req, res) => {
    const a = db.prepare('SELECT * FROM appointments WHERE id = ? AND doctor_id = ?').get(Number(req.params.id), req.user.doctor_id);
    if (!a) return err(res, 404, 'NOT_FOUND', 'Không tìm thấy lịch hẹn của bạn');
    const { status, clinicalNotes, instructions } = req.body || {};
    if (!canTransition(a.status, status))
      return err(res, 422, 'INVALID_TRANSITION', `Không thể chuyển ${a.status} → ${status}`);
    db.prepare("UPDATE appointments SET status = ?, clinical_notes = COALESCE(?, clinical_notes), instructions = COALESCE(?, instructions), updated_at = datetime('now') WHERE id = ?")
      .run(status, clinicalNotes ?? null, instructions ?? null, a.id);
    notify(a.patient_id, 'APPOINTMENT_STATUS', 'Cập nhật lịch hẹn', `Lịch lúc ${a.slot_start} chuyển sang trạng thái ${status}.`);
    res.json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(a.id));
  });

  // ---------- Admin ----------
  const admin = [auth, requireRole('ADMIN')];
  app.get('/api/admin/users', ...admin, (req, res) => {
    res.json(db.prepare('SELECT id, email, role, full_name, phone, doctor_id, is_active, created_at FROM users ORDER BY id').all());
  });
  app.patch('/api/admin/users/:id/active', ...admin, (req, res) => {
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(req.body?.isActive ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/admin/specialties', ...admin, (req, res) => {
    const { name, description } = req.body || {};
    if (!name) return err(res, 400, 'VALIDATION', 'Thiếu tên chuyên khoa');
    try {
      const id = Number(db.prepare('INSERT INTO specialties(name, description) VALUES (?,?)').run(name, description || '').lastInsertRowid);
      res.status(201).json({ id, name });
    } catch { return err(res, 409, 'EXISTS', 'Chuyên khoa đã tồn tại'); }
  });
  app.post('/api/admin/doctors', ...admin, (req, res) => {
    const b = req.body || {};
    if (!b.fullName || !b.specialtyId) return err(res, 400, 'VALIDATION', 'Thiếu họ tên hoặc chuyên khoa');
    const id = Number(db.prepare('INSERT INTO doctors(full_name, specialty_id, title, bio, consultation_fee, slot_minutes, years_experience, room) VALUES (?,?,?,?,?,?,?,?)')
      .run(b.fullName, Number(b.specialtyId), b.title || '', b.bio || '', Number(b.consultationFee || 200000), Number(b.slotMinutes || 30), Number(b.yearsExperience || 1), b.room || '').lastInsertRowid);
    res.status(201).json({ id });
  });
  app.put('/api/admin/doctors/:id/schedules', ...admin, (req, res) => {
    const doctorId = Number(req.params.id);
    const { schedules } = req.body || {};
    if (!Array.isArray(schedules)) return err(res, 400, 'VALIDATION', 'schedules phải là mảng');
    db.prepare('DELETE FROM doctor_schedules WHERE doctor_id = ?').run(doctorId);
    const ins = db.prepare('INSERT INTO doctor_schedules(doctor_id, weekday, start_time, end_time) VALUES (?,?,?,?)');
    for (const s of schedules) ins.run(doctorId, Number(s.weekday), s.startTime, s.endTime);
    res.json({ ok: true, count: schedules.length });
  });
  app.post('/api/admin/doctors/:id/time-off', ...admin, (req, res) => {
    const doctorId = Number(req.params.id);
    const { date, reason } = req.body || {};
    if (!date) return err(res, 400, 'VALIDATION', 'Thiếu ngày nghỉ');
    try {
      db.prepare('INSERT INTO doctor_time_off(doctor_id, date, reason) VALUES (?,?,?)').run(doctorId, date, reason || 'Nghỉ đột xuất');
    } catch { return err(res, 409, 'EXISTS', 'Ngày nghỉ đã được ghi nhận'); }
    // Huy cac lich bi anh huong + thong bao kem goi y dat lai
    const affected = db.prepare("SELECT * FROM appointments WHERE doctor_id = ? AND substr(slot_start,1,10) = ? AND status IN ('PENDING','CONFIRMED')").all(doctorId, date);
    for (const a of affected) {
      db.prepare("UPDATE appointments SET status = 'CANCELLED', cancel_reason = 'Bác sĩ nghỉ đột xuất', updated_at = datetime('now') WHERE id = ?").run(a.id);
      notify(a.patient_id, 'DOCTOR_TIME_OFF', 'Lịch hẹn bị hủy do bác sĩ nghỉ', `Lịch lúc ${a.slot_start} đã hủy. Mở mục Lịch của tôi → Gợi ý lịch thay thế để đặt lại.`);
    }
    res.status(201).json({ ok: true, affectedAppointments: affected.length });
  });
  app.get('/api/admin/appointments', ...admin, (req, res) => {
    const rows = db.prepare('SELECT * FROM appointments ORDER BY slot_start DESC LIMIT 200').all();
    res.json(rows.map(apptView));
  });
  app.get('/api/admin/reports', ...admin, (req, res) => {
    const byStatus = db.prepare('SELECT status, COUNT(*) AS c FROM appointments GROUP BY status').all();
    const bySpecialty = db.prepare(`SELECT s.name, COUNT(*) AS c FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id JOIN specialties s ON s.id = d.specialty_id GROUP BY s.name`).all();
    const byDoctor = db.prepare(`SELECT d.full_name, COUNT(*) AS total,
      SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN a.status = 'NO_SHOW' THEN 1 ELSE 0 END) AS no_show
      FROM appointments a JOIN doctors d ON d.id = a.doctor_id GROUP BY d.full_name ORDER BY total DESC`).all();
    const totalPatients = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'PATIENT'").get().c;
    res.json({ byStatus, bySpecialty, byDoctor, totalPatients });
  });

  app.use((req, res) => err(res, 404, 'NOT_FOUND', 'Endpoint không tồn tại'));
  return app;
}
