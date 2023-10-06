import { useState } from 'react';
import { api, clearSession, getUser, setSession, type Doctor, type User } from './api';
import { DoctorsPage, DoctorProfilePage } from './pages/PublicPages';
import { BookingPage } from './pages/BookingPage';
import { AdminDashboard, DoctorDashboard, PatientDashboard } from './pages/Dashboards';

type View = 'doctors' | 'profile' | 'booking' | 'login' | 'register' | 'patient' | 'doctor' | 'admin';

function AuthForm({ mode, onDone }: { mode: 'login' | 'register'; onDone: (u: User) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(''); const [phone, setPhone] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (mode === 'register' && password.length < 8) { setError('Mật khẩu tối thiểu 8 ký tự.'); return; }
    setLoading(true);
    try {
      const r = await api<{ token: string; user: User }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST', body: mode === 'login' ? { email, password } : { email, password, fullName, phone },
      });
      setSession(r.token, r.user); onDone(r.user);
    } catch (err) { setError(err instanceof Error ? err.message : 'Thất bại'); } finally { setLoading(false); }
  }
  return (
    <form onSubmit={submit} className="max-w-md mx-auto bg-white border rounded-3xl p-8">
      <h1 className="text-2xl font-bold mb-4">{mode === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản bệnh nhân'}</h1>
      {error && <div className="bg-rose-50 text-rose-700 rounded-xl px-3 py-2 text-sm mb-3">{error}</div>}
      {mode === 'register' && <>
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Họ và tên" className="w-full border rounded-xl px-3 py-2.5 mb-3" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Số điện thoại" className="w-full border rounded-xl px-3 py-2.5 mb-3" />
      </>}
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded-xl px-3 py-2.5 mb-3" />
      <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mật khẩu" className="w-full border rounded-xl px-3 py-2.5 mb-4" />
      <button disabled={loading} className="w-full bg-clinic-600 hover:bg-clinic-700 text-white rounded-xl py-2.5 font-medium disabled:opacity-50">{loading ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>
      {mode === 'login' && <p className="text-xs text-slate-400 mt-4">Tài khoản mẫu: patient@medibook.vn / Patient@123 · bs.an@medibook.vn / Doctor@123 · admin@medibook.vn / Admin@123</p>}
    </form>
  );
}

export default function App() {
  const [view, setView] = useState<View>('doctors');
  const [user, setUser] = useState<User | null>(getUser());
  const [selected, setSelected] = useState<Doctor | null>(null);

  function afterLogin(u: User) {
    setUser(u);
    setView(u.role === 'ADMIN' ? 'admin' : u.role === 'DOCTOR' ? 'doctor' : 'patient');
  }
  function logout() { clearSession(); setUser(null); setView('doctors'); }
  function goBook(d: Doctor | null) { setSelected(d); setView('booking'); }

  return (
    <div className="min-h-screen font-sans text-slate-800">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <button onClick={() => setView('doctors')} className="font-bold text-xl text-clinic-700">MediBook <span className="text-slate-500 font-normal text-sm">Clinic</span></button>
          <nav className="flex gap-3 text-sm ml-auto items-center flex-wrap">
            <button onClick={() => setView('doctors')} className="hover:text-clinic-600">Tìm bác sĩ</button>
            <button onClick={() => goBook(null)} className="hover:text-clinic-600">Đặt lịch</button>
            {user?.role === 'PATIENT' && <button onClick={() => setView('patient')} className="hover:text-clinic-600">Lịch của tôi</button>}
            {user?.role === 'DOCTOR' && <button onClick={() => setView('doctor')} className="hover:text-clinic-600">Lịch khám hôm nay</button>}
            {user?.role === 'ADMIN' && <button onClick={() => setView('admin')} className="hover:text-clinic-600">Quản trị</button>}
            {user ? (
              <span className="flex items-center gap-2"><span className="text-slate-500">{user.fullName}</span>
                <button onClick={logout} className="border rounded-lg px-3 py-1.5">Đăng xuất</button></span>
            ) : (
              <span className="flex gap-2">
                <button onClick={() => setView('login')} className="border rounded-lg px-3 py-1.5">Đăng nhập</button>
                <button onClick={() => setView('register')} className="bg-clinic-600 text-white rounded-lg px-3 py-1.5">Đăng ký</button>
              </span>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        {view === 'doctors' && <DoctorsPage onSelect={(d) => { setSelected(d); setView('profile'); }} />}
        {view === 'profile' && selected && <DoctorProfilePage doctor={selected} onBook={goBook} onBack={() => setView('doctors')} />}
        {view === 'booking' && <BookingPage initialDoctor={selected} goLogin={() => setView('login')} onDone={() => setView('patient')} />}
        {view === 'login' && <AuthForm mode="login" onDone={afterLogin} />}
        {view === 'register' && <AuthForm mode="register" onDone={afterLogin} />}
        {view === 'patient' && (user ? <PatientDashboard /> : <AuthForm mode="login" onDone={afterLogin} />)}
        {view === 'doctor' && (user ? <DoctorDashboard /> : <AuthForm mode="login" onDone={afterLogin} />)}
        {view === 'admin' && (user ? <AdminDashboard /> : <AuthForm mode="login" onDone={afterLogin} />)}
      </main>
      <footer className="text-center text-sm text-slate-400 py-8">MediBook Clinic — Đồ án Nhóm 2, HUIT. Dữ liệu mẫu phục vụ học tập.</footer>
    </div>
  );
}
