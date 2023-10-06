import { useEffect, useMemo, useState } from 'react';
import { api, fmtMoney, getUser, type Doctor, type Slot } from '../api';

interface Specialty { id: number; name: string }

// Dat lich tung buoc: 1 Chuyen khoa -> 2 Bac si -> 3 Ngay -> 4 Gio + ly do -> Xac nhan (giu slot tam truoc khi tao lich)
export function BookingPage({ initialDoctor, goLogin, onDone }: { initialDoctor: Doctor | null; goLogin: () => void; onDone: () => void }) {
  const [step, setStep] = useState(initialDoctor ? 3 : 1);
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [specId, setSpecId] = useState<number | null>(initialDoctor?.specialty_id ?? null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctor, setDoctor] = useState<Doctor | null>(initialDoctor);
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [timeOff, setTimeOff] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const user = getUser();

  const days = useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ key, label: d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }) });
    }
    return out;
  }, []);

  useEffect(() => { api<Specialty[]>('/api/specialties').then(setSpecs).catch(() => {}); }, []);
  useEffect(() => {
    if (!specId) return;
    api<Doctor[]>(`/api/doctors?specialtyId=${specId}`).then(setDoctors).catch((e) => setError(e.message));
  }, [specId]);
  useEffect(() => {
    if (!doctor || !date) return;
    setLoading(true); setSlot(null);
    api<{ timeOff: boolean; slots: Slot[] }>(`/api/doctors/${doctor.id}/slots?date=${date}`)
      .then((r) => { setSlots(r.slots); setTimeOff(r.timeOff); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [doctor, date]);

  async function confirm() {
    if (!doctor || !slot) return;
    if (!user) { goLogin(); return; }
    setError(''); setLoading(true);
    try {
      // Buoc giu slot tam (10 phut) roi moi tao lich chinh thuc
      await api('/api/appointments/hold', { method: 'POST', body: { doctorId: doctor.id, slotStart: slot.slotStart } });
      const appt = await api<{ id: number }>('/api/appointments', { method: 'POST', body: { doctorId: doctor.id, slotStart: slot.slotStart, reason } });
      setSuccess(`Đặt lịch thành công (mã lịch #${appt.id}). Thông báo xác nhận đã được gửi vào mục Thông báo của bạn.`);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đặt lịch thất bại');
    } finally { setLoading(false); }
  }

  const steps = ['Chuyên khoa', 'Bác sĩ', 'Ngày khám', 'Giờ & lý do', 'Hoàn tất'];
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Đặt lịch khám</h1>
      <ol className="flex flex-wrap gap-2 mb-6">
        {steps.map((s, i) => (
          <li key={s} className={`px-3 py-1.5 rounded-full text-sm ${step === i + 1 ? 'bg-clinic-600 text-white' : step > i + 1 ? 'bg-clinic-100 text-clinic-700' : 'bg-white border text-slate-500'}`}>{i + 1}. {s}</li>
        ))}
      </ol>
      {error && <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl px-4 py-3 mb-4">{error}</div>}

      {step === 1 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {specs.map((s) => (
            <button key={s.id} onClick={() => { setSpecId(s.id); setStep(2); }} className="bg-white border rounded-2xl p-5 text-left hover:border-clinic-500 font-medium">{s.name}</button>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          {doctors.length === 0 && <p className="text-slate-500">Chưa có bác sĩ thuộc chuyên khoa này.</p>}
          {doctors.map((d) => (
            <button key={d.id} onClick={() => { setDoctor(d); setStep(3); }} className="w-full bg-white border rounded-2xl p-4 text-left hover:border-clinic-500 flex justify-between">
              <span><b>{d.title} {d.full_name}</b><span className="block text-sm text-slate-500">{d.years_experience} năm kinh nghiệm · {d.room}</span></span>
              <span className="font-semibold text-clinic-700">{fmtMoney(d.consultation_fee)}</span>
            </button>
          ))}
          <button onClick={() => setStep(1)} className="text-clinic-600 text-sm">← Đổi chuyên khoa</button>
        </div>
      )}
      {step === 3 && doctor && (
        <div>
          <p className="mb-3 text-slate-600">Bác sĩ: <b>{doctor.full_name}</b> — chọn ngày trong 14 ngày tới:</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {days.map((d) => (
              <button key={d.key} onClick={() => setDate(d.key)} className={`px-3 py-2 rounded-xl border text-sm ${date === d.key ? 'bg-clinic-600 text-white' : 'bg-white'}`}>{d.label}</button>
            ))}
          </div>
          {date && (loading ? <p className="text-slate-500">Đang tải slot…</p>
            : timeOff ? <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">Bác sĩ nghỉ vào ngày này. Vui lòng chọn ngày khác.</div>
            : slots.length === 0 ? <div className="bg-white border rounded-xl px-4 py-3 text-slate-500">Bác sĩ không làm việc vào ngày này.</div>
            : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button key={s.slotStart} disabled={s.state !== 'free'} onClick={() => setSlot(s)}
                    className={`px-3 py-2 rounded-xl border text-sm ${slot?.slotStart === s.slotStart ? 'bg-clinic-600 text-white' : s.state === 'free' ? 'bg-white hover:border-clinic-500' : 'bg-slate-100 text-slate-400 line-through'}`}>
                    {s.slotStart.slice(11)}
                  </button>
                ))}
              </div>
            ))}
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(2)} className="text-clinic-600 text-sm">← Đổi bác sĩ</button>
            <button disabled={!slot} onClick={() => setStep(4)} className="ml-auto bg-clinic-600 text-white rounded-xl px-5 py-2.5 disabled:opacity-40">Tiếp tục</button>
          </div>
        </div>
      )}
      {step === 4 && doctor && slot && (
        <div className="bg-white border rounded-2xl p-6">
          <p className="mb-1">Bác sĩ: <b>{doctor.title} {doctor.full_name}</b> ({doctor.specialty_name})</p>
          <p className="mb-4">Thời gian: <b>{slot.slotStart.slice(11)} · {slot.slotStart.slice(0, 10)}</b> · Phí khám {fmtMoney(doctor.consultation_fee)}</p>
          <label className="block text-sm font-medium mb-1">Lý do khám / triệu chứng</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Ví dụ: đau họng, sốt nhẹ 2 ngày…" className="w-full border rounded-xl px-3 py-2 mb-4" />
          {!user && <p className="text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-sm mb-4">Bạn cần đăng nhập để hoàn tất đặt lịch.</p>}
          <div className="flex gap-3">
            <button onClick={() => setStep(3)} className="text-clinic-600 text-sm">← Chọn lại giờ</button>
            <button disabled={loading} onClick={confirm} className="ml-auto bg-clinic-600 hover:bg-clinic-700 text-white rounded-xl px-5 py-2.5 disabled:opacity-50">
              {loading ? 'Đang giữ slot & đặt lịch…' : user ? 'Xác nhận đặt lịch' : 'Đăng nhập để đặt lịch'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">Hệ thống giữ slot tạm 10 phút khi bạn bấm xác nhận. Hủy/đổi lịch miễn phí khi còn ít nhất 4 giờ trước giờ khám.</p>
        </div>
      )}
      {step === 5 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <p className="text-emerald-800 font-medium mb-4">{success}</p>
          <button onClick={onDone} className="bg-clinic-600 text-white rounded-xl px-5 py-2.5">Xem lịch của tôi</button>
        </div>
      )}
    </div>
  );
}
