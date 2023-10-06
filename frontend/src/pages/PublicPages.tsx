import { useEffect, useMemo, useState } from 'react';
import { api, fmtMoney, type Doctor } from '../api';

interface Specialty { id: number; name: string; description: string; doctor_count: number }
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function DoctorsPage({ onSelect }: { onSelect: (d: Doctor) => void }) {
  const [specs, setSpecs] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [specId, setSpecId] = useState<number | ''>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { api<Specialty[]>('/api/specialties').then(setSpecs).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (specId) params.set('specialtyId', String(specId));
    if (q) params.set('q', q);
    api<Doctor[]>(`/api/doctors?${params}`).then(setDoctors).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [specId, q]);

  return (
    <div>
      <section className="rounded-3xl bg-gradient-to-r from-clinic-600 to-clinic-500 text-white p-8 mb-8">
        <h1 className="text-3xl font-bold mb-2">Đặt lịch khám nhẹ nhàng, rõ ràng</h1>
        <p className="text-clinic-50/90 max-w-xl">Chọn chuyên khoa, chọn bác sĩ, chọn khung giờ còn trống — hệ thống giữ slot cho bạn trong lúc xác nhận và nhắc lịch qua thông báo.</p>
      </section>

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setSpecId('')} className={`px-4 py-2 rounded-full text-sm border ${specId === '' ? 'bg-clinic-600 text-white border-clinic-600' : 'bg-white'}`}>Tất cả chuyên khoa</button>
        {specs.map((s) => (
          <button key={s.id} onClick={() => setSpecId(s.id)} className={`px-4 py-2 rounded-full text-sm border ${specId === s.id ? 'bg-clinic-600 text-white border-clinic-600' : 'bg-white'}`}>
            {s.name} ({s.doctor_count})
          </button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên bác sĩ…" className="w-full max-w-md border rounded-xl px-4 py-2.5 mb-6 bg-white" />

      {error && <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-xl px-4 py-3 mb-4">{error}</div>}
      {loading ? <p className="text-slate-500">Đang tải danh sách bác sĩ…</p>
        : doctors.length === 0 ? <div className="bg-white rounded-2xl border p-10 text-center text-slate-500">Không tìm thấy bác sĩ phù hợp. Thử đổi chuyên khoa hoặc từ khóa khác.</div>
        : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {doctors.map((d) => (
              <article key={d.id} className="bg-white rounded-2xl border p-5 hover:shadow-md transition">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-clinic-100 text-clinic-700 flex items-center justify-center font-bold text-lg">{d.full_name.split(' ').at(-1)?.[0]}</div>
                  <div>
                    <h3 className="font-semibold">{d.title} {d.full_name}</h3>
                    <p className="text-sm text-clinic-600">{d.specialty_name} · {d.room}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 mb-3">{d.bio}</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{d.years_experience} năm kinh nghiệm</span>
                  <span className="font-semibold text-clinic-700">{fmtMoney(d.consultation_fee)}</span>
                </div>
                <button onClick={() => onSelect(d)} className="mt-4 w-full bg-clinic-600 hover:bg-clinic-700 text-white rounded-xl py-2.5 font-medium">Xem lịch & đặt khám</button>
              </article>
            ))}
          </div>
        )}
    </div>
  );
}

export function DoctorProfilePage({ doctor, onBook, onBack }: { doctor: Doctor; onBook: (d: Doctor) => void; onBack: () => void }) {
  const [full, setFull] = useState<Doctor | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Doctor>(`/api/doctors/${doctor.id}`).then(setFull).catch((e) => setError(e.message)); }, [doctor.id]);
  const scheduleText = useMemo(() => {
    if (!full?.schedules) return '';
    const byDay = new Map<number, string[]>();
    for (const s of full.schedules) {
      const arr = byDay.get(s.weekday) || [];
      arr.push(`${s.start_time}–${s.end_time}`);
      byDay.set(s.weekday, arr);
    }
    return [...byDay.entries()].map(([wd, ranges]) => `${WEEKDAY[wd]}: ${ranges.join(', ')}`).join(' · ');
  }, [full]);
  return (
    <div className="bg-white rounded-3xl border p-8 max-w-3xl">
      <button onClick={onBack} className="text-clinic-600 text-sm mb-4">← Quay lại danh sách</button>
      {error && <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 mb-4">{error}</div>}
      <h1 className="text-2xl font-bold">{doctor.title} {doctor.full_name}</h1>
      <p className="text-clinic-600 mb-4">{doctor.specialty_name} · Phòng {doctor.room} · {doctor.years_experience} năm kinh nghiệm</p>
      <p className="text-slate-700 mb-4">{doctor.bio}</p>
      <div className="bg-clinic-50 rounded-2xl p-4 text-sm mb-6">
        <p className="font-semibold mb-1">Lịch làm việc hằng tuần</p>
        <p className="text-slate-600">{scheduleText || 'Đang tải…'}</p>
        <p className="text-slate-600 mt-2">Phí khám: <b>{fmtMoney(doctor.consultation_fee)}</b> · Mỗi slot {doctor.slot_minutes} phút</p>
      </div>
      <button onClick={() => onBook(doctor)} className="bg-clinic-600 hover:bg-clinic-700 text-white rounded-xl px-6 py-3 font-medium">Đặt lịch với bác sĩ này</button>
    </div>
  );
}
