import { useEffect, useState } from 'react';
import { getJson, putJson, postJson, patchJson, ApiError } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

const EMPTY_CREDENTIALS_FORM = { currentPassword: '', newUsername: '', newPassword: '' };

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [credentialsForm, setCredentialsForm] = useState(EMPTY_CREDENTIALS_FORM);
  const [credentialsError, setCredentialsError] = useState('');
  const [credentialsMessage, setCredentialsMessage] = useState('');

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

  async function handleChangeCredentials(e) {
    e.preventDefault();
    setCredentialsError('');
    setCredentialsMessage('');
    try {
      const res = await patchJson('/api/admin/credentials', {
        currentPassword: credentialsForm.currentPassword,
        newUsername: credentialsForm.newUsername.trim() || undefined,
        newPassword: credentialsForm.newPassword || undefined,
      });
      setCredentialsMessage(`Credentials updated. Signed in as "${res.username}".`);
      setCredentialsForm(EMPTY_CREDENTIALS_FORM);
    } catch (err) {
      setCredentialsError(err instanceof ApiError ? err.message : 'Could not update credentials.');
    }
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

      <div className="rounded-2xl bg-white/10 p-5">
        <p className="mb-1 font-bold">Cliq alias</p>
        <p className="mb-3 text-sm text-white/70">Shown to guests who choose the Cash option.</p>
        <div className="flex gap-3">
          <input
            type="text"
            defaultValue={settings.cliqAlias}
            onBlur={(e) => updateSetting('cliqAlias', e.target.value.trim())}
            maxLength={50}
            className="flex-1 rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>
      </div>

      <form onSubmit={handleChangeCredentials} className="space-y-3 rounded-2xl bg-white/10 p-5">
        <p className="font-bold">Change admin login</p>
        <p className="text-sm text-white/70">Leave "New username" blank to keep the current one.</p>
        <input
          type="password"
          required
          placeholder="Current password"
          value={credentialsForm.currentPassword}
          onChange={(e) => setCredentialsForm((f) => ({ ...f, currentPassword: e.target.value }))}
          className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
        />
        <input
          type="text"
          placeholder="New username (optional)"
          value={credentialsForm.newUsername}
          onChange={(e) => setCredentialsForm((f) => ({ ...f, newUsername: e.target.value }))}
          className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
        />
        <input
          type="password"
          placeholder="New password (optional)"
          value={credentialsForm.newPassword}
          onChange={(e) => setCredentialsForm((f) => ({ ...f, newPassword: e.target.value }))}
          className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
        />
        {credentialsError && <p className="font-semibold text-yellow-200">{credentialsError}</p>}
        {credentialsMessage && <p className="font-semibold text-green-200">{credentialsMessage}</p>}
        <button type="submit" className="rounded-full bg-party-yellow px-6 py-2 font-extrabold text-purple-900">
          Save
        </button>
      </form>

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
