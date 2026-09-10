import { useEffect, useMemo, useState } from 'react';
import { getJson, del } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

function groupBySession(participants) {
  const groups = new Map();
  const order = [];
  for (const p of participants) {
    const key = p.sessionId ?? `single-${p.id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(p);
  }
  return order.map((key) => groups.get(key));
}

export default function AdminParticipants() {
  const [participants, setParticipants] = useState([]);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [cliqAlias, setCliqAlias] = useState('');

  useEffect(() => {
    getJson('/api/admin/settings').then((res) => setCliqAlias(res.cliqAlias));
  }, []);

  async function load() {
    const params = new URLSearchParams({ sort, search });
    const res = await getJson(`/api/admin/participants?${params.toString()}`);
    setParticipants(res.participants);
    setTotal(res.total);
  }

  useEffect(() => {
    load();
  }, [sort, search]);

  async function confirmDelete() {
    await del(`/api/admin/participants/${deletingId}`);
    setDeletingId(null);
    await load();
  }

  const groups = useMemo(() => groupBySession(participants), [participants]);

  function renderOutcome(p) {
    return p.outcome === 'cash' ? (
      <span>💰 Cash (Cliq: {cliqAlias})</span>
    ) : (
      <div className="flex items-center gap-2">
        {p.giftImageUrl && <img src={p.giftImageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />}
        <span>{p.giftName ?? '(gift removed)'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">Total participants: {total}</p>
        <div className="flex gap-3">
          <input
            type="search"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border-2 border-white/30 bg-white/10 px-4 py-2 text-sm outline-none focus:border-white"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-full border-2 border-white/30 bg-white/10 px-4 py-2 text-sm outline-none focus:border-white"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="p-3">Name</th>
              <th className="p-3">Gift</th>
              <th className="p-3">Date</th>
              <th className="p-3">Time</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-white/60">
                  No one has spun the wheel yet.
                </td>
              </tr>
            )}
            {groups.map((group) => {
              if (group.length === 1) {
                const p = group[0];
                const date = new Date(p.createdAt);
                return (
                  <tr key={p.id} className="border-b border-white/10">
                    <td className="p-3 font-bold">{p.name}</td>
                    <td className="p-3">{renderOutcome(p)}</td>
                    <td className="p-3">{date.toLocaleDateString()}</td>
                    <td className="p-3">{date.toLocaleTimeString()}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setDeletingId(p.id)}
                        className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-bold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              }

              const sessionKey = group[0].sessionId;
              return (
                <tr key={sessionKey} className="border-b border-white/10">
                  <td className="p-3 align-top font-bold">
                    <div>{group[0].name}</div>
                    <span className="mt-1 inline-block rounded-full bg-party-yellow/90 px-2 py-0.5 text-[10px] font-extrabold text-purple-900">
                      🎁🎁 2-gift pick
                    </span>
                  </td>
                  <td className="p-3 align-top">
                    <div className="space-y-2">
                      {group.map((p) => (
                        <div key={p.id}>{renderOutcome(p)}</div>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 align-top">
                    {group.map((p) => (
                      <div key={p.id}>{new Date(p.createdAt).toLocaleDateString()}</div>
                    ))}
                  </td>
                  <td className="p-3 align-top">
                    {group.map((p) => (
                      <div key={p.id}>{new Date(p.createdAt).toLocaleTimeString()}</div>
                    ))}
                  </td>
                  <td className="p-3 align-top">
                    <div className="space-y-2">
                      {group.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setDeletingId(p.id)}
                          className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-bold"
                        >
                          Delete
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete this participant?"
        description="This permanently removes their spin record."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
