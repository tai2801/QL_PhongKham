import { useCallback, useEffect, useState } from 'react';
import { api, fmtSlot, STATUS_COLOR, STATUS_LABEL, type Appointment } from '../api';

function Badge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status] || 'bg-slate-100'}`}>{STATUS_LABEL[status] || status}</span>;
}
function Msg({ error, ok }: { error: string; ok: string }) {
  return <>
    {error && <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl px-4 py-3 mb-4">{error}</div>}
    {ok && <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl px-4 py-3 mb-4">{ok}</div>}
  </>;
}

// ---------------- Patient ----------------
export function PatientDashboard() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [notifs, setNotifs] = useState<{ id: number; title: string; body: string; is_read: number; created_at: string }[]>([]);
  const [alts, setAlts] = useState<Record<number, { doctorName: string; slotStart: string }[]>>({});
  const [error, setError] = useState(''); const [ok, setOk] = useState(''); const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([api<Appointment[]>('/api/appointments/mine'), api<typeof notifs>('/api/notifications')])
      .then(([a, n]) => { setItems(a); setNotifs(n); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function cancel(id: number) {
    if (!confirm('Bạn chắc chắn muốn hủy lịch này? Chỉ hủy được khi còn ít nhất 4 giờ trước giờ khám.')) return;
    setError(''); setOk('');
    try { await api(`/api/appointments/${id}/cancel`, { method: 'PATCH', body: { reason: 'Bệnh nhân hủy trên web' } }); setOk('Đã hủy lịch.'); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Hủy thất bại'); }
  }
  async function showAlternatives(id: number) {
    try {
      const r = await api<{ alternatives: { doctorName: string; slotStart: string }[] }>(`/api/appointments/${id}/alternatives`);
      setAlts((m) => ({ ...m, [id]: r.alternatives }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lấy được gợi ý'); }
  }

  if (loading) return <p className="text-slate-500">Đang tải lịch của bạn…</p>;
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2">
        <h1 className="text-2xl font-bold mb-4">Lịch khám của tôi</h1>
        <Msg error={error} ok={ok} />
        {items.length === 0 ? <div className="bg-white border rounded-2xl p-8 text-center text-slate-500">Bạn chưa có lịch hẹn nào.</div> : (
          <div className="space-y-3">
            {items.map((a) => (
              <article key={a.id} className="bg-white border rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div><b>{fmtSlot(a.slot_start)}</b> · {a.doctor_name}<p className="text-sm text-slate-500">{a.reason}</p></div>
                  <Badge status={a.status} />
                </div>
                {a.clinical_notes && <p className="text-sm mt-2 bg-clinic-50 rounded-xl px-3 py-2"><b>Kết luận:</b> {a.clinical_notes}{a.instructions && <> · <b>Dặn dò:</b> {a.instructions}</>}</p>}
                <div className="flex gap-2 mt-3">
                  {['PENDING', 'CONFIRMED'].includes(a.status) && <button onClick={() => cancel(a.id)} className="text-sm border border-rose-300 text-rose-600 rounded-lg px-3 py-1.5">Hủy lịch</button>}
                  {a.status === 'CANCELLED' && <button onClick={() => showAlternatives(a.id)} className="text-sm border border-clinic-500 text-clinic-700 rounded-lg px-3 py-1.5">Gợi ý lịch thay thế</button>}
                </div>
                {alts[a.id] && (
                  <div className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <b>Slot thay thế cùng chuyên khoa:</b>
                    {alts[a.id].length === 0 ? <p>Chưa có slot trống trong 7 ngày tới.</p> : alts[a.id].map((s, i) => <p key={i}>· {s.doctorName} — {fmtSlot(s.slotStart)}</p>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <aside>
        <h2 className="text-lg font-bold mb-3">Thông báo</h2>
        {notifs.length === 0 ? <p className="text-slate-500 text-sm">Chưa có thông báo.</p> : (
          <div className="space-y-2">
            {notifs.map((n) => (
              <div key={n.id} className={`rounded-xl border px-3 py-2 text-sm ${n.is_read ? 'bg-white' : 'bg-clinic-50 border-clinic-100'}`}>
                <b>{n.title}</b><p className="text-slate-600">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------- Doctor ----------------
export function DoctorDashboard() {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(todayKey);
  const [items, setItems] = useState<Appointment[]>([]);
  const [error, setError] = useState(''); const [ok, setOk] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    api<Appointment[]>(`/api/doctor/appointments?date=${date}`).then(setItems).catch((e) => setError(e.message));
  }, [date]);
  useEffect(load, [load]);

  async function setStatus(a: Appointment, status: string) {
    setError(''); setOk('');
    try {
      await api(`/api/doctor/appointments/${a.id}/status`, { method: 'PATCH', body: { status, clinicalNotes: status === 'COMPLETED' ? notes[a.id] || undefined : undefined } });
      setOk(`Đã cập nhật lịch #${a.id} → ${STATUS_LABEL[status]}`); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Cập nhật thất bại'); }
  }
  const nextAction: Record<string, { label: string; status: string }[]> = {
    PENDING: [{ label: 'Xác nhận', status: 'CONFIRMED' }, { label: 'Không đến', status: 'NO_SHOW' }],
    CONFIRMED: [{ label: 'Bệnh nhân đã đến', status: 'ARRIVED' }, { label: 'Không đến', status: 'NO_SHOW' }],
    ARRIVED: [{ label: 'Hoàn tất khám', status: 'COMPLETED' }],
  };
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Lịch khám của bác sĩ</h1>
      <Msg error={error} ok={ok} />
      <label className="text-sm mr-2">Ngày:</label>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded-xl px-3 py-2 bg-white mb-4" />
      {items.length === 0 ? <div className="bg-white border rounded-2xl p-8 text-center text-slate-500">Không có lịch hẹn nào trong ngày này.</div> : (
        <div className="space-y-3">
          {items.map((a) => (
            <article key={a.id} className="bg-white border rounded-2xl p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div><b>{a.slot_start.slice(11)}–{a.slot_end.slice(11)}</b> · {a.patient_name} ({a.patient_phone})<p className="text-sm text-slate-500">Lý do: {a.reason}</p></div>
                <Badge status={a.status} />
              </div>
              {a.status === 'ARRIVED' && (
                <textarea value={notes[a.id] || ''} onChange={(e) => setNotes((m) => ({ ...m, [a.id]: e.target.value }))} placeholder="Nội dung khám / chỉ định trước khi hoàn tất…" className="w-full border rounded-xl px-3 py-2 mt-3 text-sm" rows={2} />
              )}
              <div className="flex gap-2 mt-3">
                {(nextAction[a.status] || []).map((act) => (
                  <button key={act.status} onClick={() => setStatus(a, act.status)} className="text-sm bg-clinic-600 text-white rounded-lg px-3 py-1.5">{act.label}</button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Admin ----------------
interface Report { byStatus: { status: string; c: number }[]; bySpecialty: { name: string; c: number }[]; byDoctor: { full_name: string; total: number; completed: number; no_show: number }[]; totalPatients: number }
export function AdminDashboard() {
  const [report, setReport] = useState<Report | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [error, setError] = useState(''); const [ok, setOk] = useState('');
  const [offDoctor, setOffDoctor] = useState('4'); const [offDate, setOffDate] = useState(''); const [offReason, setOffReason] = useState('');
  const [newSpec, setNewSpec] = useState('');

  const load = useCallback(() => {
    Promise.all([api<Report>('/api/admin/reports'), api<Appointment[]>('/api/admin/appointments')])
      .then(([r, a]) => { setReport(r); setAppts(a); }).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function markOff() {
    setError(''); setOk('');
    try {
      const r = await api<{ affectedAppointments: number }>('/api/admin/doctors/' + offDoctor + '/time-off', { method: 'POST', body: { date: offDate, reason: offReason || 'Nghỉ đột xuất' } });
      setOk(`Đã ghi nhận ngày nghỉ. ${r.affectedAppointments} lịch hẹn bị ảnh hưởng đã được hủy + thông báo cho bệnh nhân.`); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Thất bại'); }
  }
  async function addSpec() {
    try { await api('/api/admin/specialties', { method: 'POST', body: { name: newSpec } }); setOk('Đã thêm chuyên khoa.'); setNewSpec(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thất bại'); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Quản trị phòng khám</h1>
      <Msg error={error} ok={ok} />
      {report && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border rounded-2xl p-4"><p className="text-slate-500 text-sm">Tổng bệnh nhân</p><p className="text-2xl font-bold">{report.totalPatients}</p></div>
          <div className="bg-white border rounded-2xl p-4"><p className="text-slate-500 text-sm">Lượt khám theo trạng thái</p>{report.byStatus.map((s) => <p key={s.status} className="text-sm">{STATUS_LABEL[s.status] || s.status}: <b>{s.c}</b></p>)}</div>
          <div className="bg-white border rounded-2xl p-4"><p className="text-slate-500 text-sm">Lượt khám theo chuyên khoa</p>{report.bySpecialty.map((s) => <p key={s.name} className="text-sm">{s.name}: <b>{s.c}</b></p>)}</div>
        </div>
      )}
      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <section className="bg-white border rounded-2xl p-5">
          <h2 className="font-bold mb-3">Đánh dấu bác sĩ nghỉ đột xuất</h2>
          <label className="text-sm block mb-1">ID bác sĩ</label>
          <input value={offDoctor} onChange={(e) => setOffDoctor(e.target.value)} className="border rounded-xl px-3 py-2 w-full mb-2" />
          <label className="text-sm block mb-1">Ngày nghỉ</label>
          <input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} className="border rounded-xl px-3 py-2 w-full mb-2" />
          <input value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="Lý do" className="border rounded-xl px-3 py-2 w-full mb-3" />
          <button onClick={markOff} className="bg-clinic-600 text-white rounded-xl px-4 py-2">Ghi nhận & hủy lịch bị ảnh hưởng</button>
        </section>
        <section className="bg-white border rounded-2xl p-5">
          <h2 className="font-bold mb-3">Thêm chuyên khoa</h2>
          <input value={newSpec} onChange={(e) => setNewSpec(e.target.value)} placeholder="Tên chuyên khoa mới" className="border rounded-xl px-3 py-2 w-full mb-3" />
          <button onClick={addSpec} className="bg-clinic-600 text-white rounded-xl px-4 py-2">Thêm chuyên khoa</button>
          {report && <div className="mt-4 text-sm"><h3 className="font-semibold mb-1">Lượt khám theo bác sĩ</h3>{report.byDoctor.map((d) => <p key={d.full_name}>{d.full_name}: tổng {d.total} · hoàn tất {d.completed} · không đến {d.no_show}</p>)}</div>}
        </section>
      </div>
      <section className="bg-white border rounded-2xl p-5 overflow-x-auto">
        <h2 className="font-bold mb-3">Tất cả lịch hẹn (gần nhất)</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Giờ</th><th>Bệnh nhân</th><th>Bác sĩ</th><th>Lý do</th><th>Trạng thái</th></tr></thead>
          <tbody>{appts.map((a) => <tr key={a.id} className="border-t"><td className="py-2">{fmtSlot(a.slot_start)}</td><td>{a.patient_name}</td><td>{a.doctor_name}</td><td>{a.reason}</td><td><Badge status={a.status} /></td></tr>)}</tbody>
        </table>
        {appts.length === 0 && <p className="text-slate-500">Chưa có lịch hẹn nào.</p>}
      </section>
    </div>
  );
}
