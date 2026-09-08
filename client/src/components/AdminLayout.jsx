import { useEffect, useState } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { getJson, postJson } from '../lib/api.js';

export function AdminLayout() {
  const [status, setStatus] = useState('checking');
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getJson('/api/admin/me')
      .then((res) => {
        if (cancelled) return;
        setUsername(res.username);
        setStatus('authed');
      })
      .catch(() => {
        if (!cancelled) navigate('/admin/login');
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleLogout() {
    await postJson('/api/admin/logout', {});
    navigate('/admin/login');
  }

  if (status === 'checking') {
    return <div className="p-8 text-center text-white">Checking admin session...</div>;
  }

  const navLinkClass = ({ isActive }) =>
    `rounded-full px-4 py-2 text-sm font-bold transition ${
      isActive ? 'bg-white text-purple-900' : 'bg-white/10 text-white hover:bg-white/20'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-pink-800 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <NavLink to="/admin" end className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/admin/gifts" className={navLinkClass}>
            Gifts
          </NavLink>
          <NavLink to="/admin/participants" className={navLinkClass}>
            Participants
          </NavLink>
          <NavLink to="/admin/settings" className={navLinkClass}>
            Settings
          </NavLink>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/70">Signed in as {username}</span>
          <button type="button" onClick={handleLogout} className="rounded-full bg-white/10 px-4 py-2 font-bold hover:bg-white/20">
            Log out
          </button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
