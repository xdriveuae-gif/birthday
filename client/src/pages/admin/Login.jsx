import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postJson, ApiError } from '../../lib/api.js';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await postJson('/api/admin/login', { username, password });
      navigate('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-900 to-pink-800 px-6 text-white">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl bg-white/10 p-8 backdrop-blur">
        <h1 className="mb-6 text-center font-display text-2xl font-extrabold">🎂 Admin Login</h1>
        <label className="mb-1 block text-sm font-bold" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mb-4 w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          autoComplete="username"
        />
        <label className="mb-1 block text-sm font-bold" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          autoComplete="current-password"
        />
        {error && (
          <p role="alert" className="mb-4 font-semibold text-yellow-200">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-party-yellow py-3 font-extrabold text-purple-900 disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
