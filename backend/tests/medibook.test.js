import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { generateDaySlots, isAlignedSlot, canModifyAt, canTransition } from '../src/slots.js';

let server, base, db;
let patientToken, patient2Token, doctorToken, adminToken;

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}
async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.json)}`);
  return r.json.token;
}
// Tim ngay + slot trong tuong lai con trong cua 1 bac si (quet 7 ngay toi)
async function findFreeSlot(doctorId, token) {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    // dung ngay local: toISOString la UTC nen tu tinh lai
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    void key;
    const r = await api(`/api/doctors/${doctorId}/slots?date=${local}`);
    const free = (r.json.slots || []).find((s) => s.state === 'free');
    if (free) return { date: local, slot: free };
  }
  return null;
}

before(async () => {
  const app = createApp(':memory:');
  db = app.locals.db;
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  patientToken = await login('patient@medibook.vn', 'Patient@123');
  patient2Token = await login('patient2@medibook.vn', 'Patient@123');
  doctorToken = await login('bs.an@medibook.vn', 'Doctor@123');
  adminToken = await login('admin@medibook.vn', 'Admin@123');
});
after(() => server.close());

// ---------- Unit: slot logic ----------
test('generateDaySlots: ca 08:00-11:30, slot 30p -> 7 slot', () => {
  const slots = generateDaySlots('2023-10-09', [{ start_time: '08:00', end_time: '11:30' }], 30);
  assert.equal(slots.length, 7);
  assert.equal(slots[0].slotStart, '2023-10-09T08:00');
  assert.equal(slots.at(-1).slotEnd, '2023-10-09T11:30');
});
test('isAlignedSlot: 08:15 khong dung luoi 30p, 08:30 dung', () => {
  const sch = [{ start_time: '08:00', end_time: '11:30' }];
  assert.equal(isAlignedSlot('2023-10-09', sch, 30, '2023-10-09T08:15'), false);
  assert.equal(isAlignedSlot('2023-10-09', sch, 30, '2023-10-09T08:30'), true);
});
test('canModifyAt: con 5h -> duoc, con 2h (han 4h) -> khong', () => {
  const now = new Date(2023, 9, 9, 8, 0);
  assert.equal(canModifyAt('2023-10-09T13:00', now, 4), true);
  assert.equal(canModifyAt('2023-10-09T10:00', now, 4), false);
});
test('canTransition: PENDING->COMPLETED bi cam, PENDING->CONFIRMED duoc', () => {
  assert.equal(canTransition('PENDING', 'COMPLETED'), false);
  assert.equal(canTransition('PENDING', 'CONFIRMED'), true);
  assert.equal(canTransition('COMPLETED', 'CANCELLED'), false);
});

// ---------- API ----------
test('GET /health -> ok', async () => {
  const r = await api('/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});
test('login sai mat khau -> 401', async () => {
  const r = await api('/api/auth/login', { method: 'POST', body: { email: 'patient@medibook.vn', password: 'sai' } });
  assert.equal(r.status, 401);
});
test('register mat khau ngan -> 400, register hop le -> 201', async () => {
  const bad = await api('/api/auth/register', { method: 'POST', body: { email: 'x@x.vn', password: '123', fullName: 'X' } });
  assert.equal(bad.status, 400);
  const ok = await api('/api/auth/register', { method: 'POST', body: { email: 'new@medibook.vn', password: 'Patient@123', fullName: 'Bệnh Nhân Mới' } });
  assert.equal(ok.status, 201);
});
test('loc bac si theo chuyen khoa', async () => {
  const specs = await api('/api/specialties');
  assert.ok(specs.json.length >= 5);
  const nhi = specs.json.find((s) => s.name === 'Nhi khoa');
  const docs = await api(`/api/doctors?specialtyId=${nhi.id}`);
  assert.ok(docs.json.length >= 2);
  assert.ok(docs.json.every((d) => d.specialty_id === nhi.id));
});

let booked;
test('dat lich thanh cong -> 201 PENDING + co thong bao', async () => {
  const found = await findFreeSlot(1, patientToken);
  assert.ok(found, 'phai tim duoc slot trong trong 7 ngay');
  const r = await api('/api/appointments', { method: 'POST', token: patientToken, body: { doctorId: 1, slotStart: found.slot.slotStart, reason: 'Đau đầu, chóng mặt' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.status, 'PENDING');
  booked = r.json;
  const notifs = await api('/api/notifications', { token: patientToken });
  assert.ok(notifs.json.some((n) => n.type === 'APPOINTMENT_CREATED'));
});
test('dat trung slot (benh nhan khac) -> 409', async () => {
  const r = await api('/api/appointments', { method: 'POST', token: patient2Token, body: { doctorId: 1, slotStart: booked.slot_start, reason: 'Trùng' } });
  assert.equal(r.status, 409);
});
test('giu slot tam: nguoi khac khong dat duoc, chu giu dat duoc', async () => {
  const found = await findFreeSlot(2, patientToken);
  assert.ok(found);
  const hold = await api('/api/appointments/hold', { method: 'POST', token: patientToken, body: { doctorId: 2, slotStart: found.slot.slotStart } });
  assert.equal(hold.status, 201, JSON.stringify(hold.json));
  const other = await api('/api/appointments', { method: 'POST', token: patient2Token, body: { doctorId: 2, slotStart: found.slot.slotStart, reason: 'Chen ngang' } });
  assert.equal(other.status, 409);
  const own = await api('/api/appointments', { method: 'POST', token: patientToken, body: { doctorId: 2, slotStart: found.slot.slotStart, reason: 'Đặt sau khi giữ' } });
  assert.equal(own.status, 201, JSON.stringify(own.json));
});
test('dat ngoai gio lam viec (chu nhat, bac si 1 khong lam) -> 422', async () => {
  const d = new Date(); // tim chu nhat sap toi
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await api('/api/appointments', { method: 'POST', token: patientToken, body: { doctorId: 1, slotStart: `${key}T08:00`, reason: 'Ngoài giờ' } });
  assert.equal(r.status, 422);
});
test('dat slot khong dung luoi (08:15 voi slot 30p) -> 422', async () => {
  const found = await findFreeSlot(1, patientToken);
  const date = found.slot.slotStart.slice(0, 10);
  const r = await api('/api/appointments', { method: 'POST', token: patientToken, body: { doctorId: 1, slotStart: `${date}T08:15`, reason: 'Lệch lưới' } });
  assert.equal(r.status, 422);
});
test('bac si chuyen trang thai: PENDING->COMPLETED bi chan 422, dung trinh tu thi duoc', async () => {
  const bad = await api(`/api/doctor/appointments/${booked.id}/status`, { method: 'PATCH', token: doctorToken, body: { status: 'COMPLETED' } });
  assert.equal(bad.status, 422);
  for (const st of ['CONFIRMED', 'ARRIVED']) {
    const r = await api(`/api/doctor/appointments/${booked.id}/status`, { method: 'PATCH', token: doctorToken, body: { status: st } });
    assert.equal(r.status, 200, `${st}: ${JSON.stringify(r.json)}`);
  }
  const done = await api(`/api/doctor/appointments/${booked.id}/status`, { method: 'PATCH', token: doctorToken, body: { status: 'COMPLETED', clinicalNotes: 'Huyết áp ổn định, kê đơn 5 ngày.', instructions: 'Uống sau ăn, tái khám sau 1 tuần.' } });
  assert.equal(done.status, 200);
  assert.equal(done.json.clinical_notes, 'Huyết áp ổn định, kê đơn 5 ngày.');
});
test('huy lich con xa -> 200; huy qua han (<4h) -> 422', async () => {
  const found = await findFreeSlot(3, patientToken);
  const r = await api('/api/appointments', { method: 'POST', token: patientToken, body: { doctorId: 3, slotStart: found.slot.slotStart, reason: 'Khám nhi' } });
  assert.equal(r.status, 201);
  const cancel = await api(`/api/appointments/${r.json.id}/cancel`, { method: 'PATCH', token: patientToken, body: { reason: 'Bận việc' } });
  assert.equal(cancel.status, 200);
  // Tao truc tiep 1 lich chi con 1h nua qua DB de kiem tra han huy
  const soon = new Date(Date.now() + 3600 * 1000);
  const start = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}T${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
  const pid = db.prepare("SELECT id FROM users WHERE email = 'patient@medibook.vn'").get().id;
  const id = Number(db.prepare('INSERT INTO appointments(patient_id, doctor_id, slot_start, slot_end, reason) VALUES (?,?,?,?,?)')
    .run(pid, 3, start, start, 'Gấp').lastInsertRowid);
  const late = await api(`/api/appointments/${id}/cancel`, { method: 'PATCH', token: patientToken, body: {} });
  assert.equal(late.status, 422);
  assert.equal(late.json.error, 'TOO_LATE_TO_CANCEL');
});
test('benh nhan thuong khong vao duoc API admin -> 403', async () => {
  const r = await api('/api/admin/users', { token: patientToken });
  assert.equal(r.status, 403);
});
test('admin danh dau bac si nghi dot xuat: lich bi huy + co goi y thay the', async () => {
  const found = await findFreeSlot(4, patientToken);
  assert.ok(found);
  const r = await api('/api/appointments', { method: 'POST', token: patientToken, body: { doctorId: 4, slotStart: found.slot.slotStart, reason: 'Khám nhi định kỳ' } });
  assert.equal(r.status, 201);
  const off = await api('/api/admin/doctors/4/time-off', { method: 'POST', token: adminToken, body: { date: found.date, reason: 'Họp chuyên môn đột xuất' } });
  assert.equal(off.status, 201, JSON.stringify(off.json));
  assert.ok(off.json.affectedAppointments >= 1);
  const mine = await api('/api/appointments/mine', { token: patientToken });
  const cancelled = mine.json.find((a) => a.id === r.json.id);
  assert.equal(cancelled.status, 'CANCELLED');
  const alt = await api(`/api/appointments/${r.json.id}/alternatives`, { token: patientToken });
  assert.equal(alt.status, 200);
  assert.ok(Array.isArray(alt.json.alternatives));
});
test('admin reports co du lieu theo trang thai + chuyen khoa', async () => {
  const r = await api('/api/admin/reports', { token: adminToken });
  assert.equal(r.status, 200);
  assert.ok(r.json.byStatus.length >= 3);
  assert.ok(r.json.totalPatients >= 3);
});
