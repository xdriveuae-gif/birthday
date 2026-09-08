import { useEffect, useState } from 'react';
import { getJson } from '../../lib/api.js';
import { StatCard } from '../../components/StatCard.jsx';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getJson('/api/admin/stats')
      .then(setStats)
      .catch(() => setError('Could not load stats.'));
  }, []);

  if (error) return <p className="font-semibold text-yellow-200">{error}</p>;
  if (!stats) return <p>Loading stats...</p>;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard emoji="🎉" label="Participants" value={stats.totalParticipants} />
      <StatCard emoji="🎁" label="Gifts" value={stats.totalGifts} />
      <StatCard emoji="✅" label="Active Gifts" value={stats.activeGifts} />
      <StatCard emoji="🔥" label="Gifts Assigned" value={stats.giftsAssigned} />
      <StatCard emoji="📦" label="Gifts Remaining" value={stats.giftsRemaining ?? '∞'} />
      <StatCard emoji="💰" label="Cash Picks" value={stats.cashPicks} />
    </div>
  );
}
