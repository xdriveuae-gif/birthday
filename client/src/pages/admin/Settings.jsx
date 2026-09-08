import { useEffect, useState } from 'react';
import { getJson, putJson, postJson } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    getJson('/api/admin/settings').then(setSettings);
  }, []);

  async function updateSetting(key, value) {
    const updated = await putJson('/api/admin/settings', { [key]: value });
    setSettings(updated);
  }

  async function handleReset() {
    await postJson('/api/admin/participants/reset', {});
    setConfirmingReset(false);
    setMessage('All results have been reset. Every gift is available again.');
  }

  if (!settings) return <p>Loading settings...</p>;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between rounded-2xl bg-white/10 p-5">
        <div>
          <p className="font-bold">Wheel enabled</p>
          <p className="text-sm text-white/70">Turn the wheel off to pause spinning for everyone.</p>
        </div>
        <input
          type="checkbox"
          checked={settings.wheelEnabled}
          onChange={(e) => updateSetting('wheelEnabled', e.target.checked)}
          className="h-6 w-6"
        />
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-white/10 p-5">
        <div>
          <p className="font-bold">Allow repeat gifts</p>
          <p className="text-sm text-white/70">If off, each gift can only be won once.</p>
        </div>
        <input
          type="checkbox"
          checked={settings.allowRepeatGifts}
          onChange={(e) => updateSetting('allowRepeatGifts', e.target.checked)}
          className="h-6 w-6"
        />
      </div>

      <div className="rounded-2xl bg-red-500/20 p-5">
        <p className="font-bold">Reset all results</p>
        <p className="mb-3 text-sm text-white/80">
          Deletes every participant record and makes all gifts available again. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setConfirmingReset(true)}
          className="rounded-full bg-red-500 px-5 py-2 font-bold text-white"
        >
          Reset all results
        </button>
      </div>

      {message && <p className="font-semibold text-green-200">{message}</p>}

      <ConfirmDialog
        open={confirmingReset}
        title="Reset all results?"
        description="This permanently deletes every participant record and makes all gifts available again. This cannot be undone."
        confirmLabel="Yes, delete everything"
        onConfirm={handleReset}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}
