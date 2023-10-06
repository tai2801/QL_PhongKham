// Lop goi API dung chung - tu gan JWT tu localStorage, nem Error kem message tieng Viet.
const BASE = import.meta.env.VITE_API_URL || '';

export interface User { id: number; email: string; role: 'PATIENT' | 'DOCTOR' | 'ADMIN'; fullName: string; doctorId?: number | null }
export interface Doctor {
  id: number; full_name: string; specialty_id: number; specialty_name: string; title: string; bio: string;
  consultation_fee: number; slot_minutes: number; years_experience: number; room: string;
  schedules?: { weekday: number; start_time: string; end_time: string }[];
}
export interface Slot { slotStart: string; slotEnd: string; state: 'free' | 'booked' | 'held' | 'past' }
export interface Appointment {
  id: number; patient_id: number; doctor_id: number; slot_start: string; slot_end: string; reason: string;
  status: string; cancel_reason: string; clinical_notes: string; instructions: string;
  doctor_name?: string; patient_name?: string; patient_phone?: string;
}

export function getToken() { return localStorage.getItem('mb_token'); }
export function getUser(): User | null {
  const raw = localStorage.getItem('mb_user');
  return raw ? (JSON.parse(raw) as User) : null;
}
export function setSession(token: string, user: User) {
  localStorage.setItem('mb_token', token);
  localStorage.setItem('mb_user', JSON.stringify(user));
}
export function clearSession() { localStorage.removeItem('mb_token'); localStorage.removeItem('mb_user'); }

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || `Lỗi ${res.status}`);
  return data as T;
}

export const fmtMoney = (n: number) => n.toLocaleString('vi-VN') + '₫';
export const fmtSlot = (s: string) => {
  const [d, t] = s.split('T');
  const [y, m, dd] = d.split('-');
  return `${t} · ${dd}/${m}/${y}`;
};
export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', ARRIVED: 'Đã đến',
  COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', NO_SHOW: 'Không đến',
};
export const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800', CONFIRMED: 'bg-sky-100 text-sky-800', ARRIVED: 'bg-violet-100 text-violet-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-rose-100 text-rose-700', NO_SHOW: 'bg-slate-200 text-slate-600',
};
