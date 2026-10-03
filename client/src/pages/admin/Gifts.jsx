import { useEffect, useState } from 'react';
import { getJson, postForm, putForm, patchJson, del, ApiError } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx';

const EMPTY_FORM = { name: '', productUrl: '', price: '', priceRange: '', active: true, imageFile: null };
const PRICE_RANGES = ['10-25', '25-50', '50-100'];

export default function AdminGifts() {
  const [gifts, setGifts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  async function loadGifts() {
    const res = await getJson('/api/admin/gifts');
    setGifts(res.gifts);
  }

  useEffect(() => {
    loadGifts();
  }, []);

  function handleImageChange(e) {
    const file = e.target.files?.[0] ?? null;
    setForm((f) => ({ ...f, imageFile: file }));
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  function startEdit(gift) {
    setEditingId(gift.id);
    setForm({
      name: gift.name,
      productUrl: gift.productUrl,
      price: gift.price ?? '',
      priceRange: gift.priceRange ?? '',
      active: gift.active,
      imageFile: null,
    });
    setImagePreview(gift.imageUrl);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImagePreview(null);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const body = new FormData();
    body.set('name', form.name);
    body.set('productUrl', form.productUrl);
    body.set('price', form.price);
    body.set('priceRange', form.priceRange);
    body.set('active', String(form.active));
    if (form.imageFile) body.set('image', form.imageFile);

    try {
      if (editingId) {
        await putForm(`/api/admin/gifts/${editingId}`, body);
      } else {
        await postForm('/api/admin/gifts', body);
      }
      resetForm();
      await loadGifts();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the gift.');
    }
  }

  async function toggleActive(gift) {
    await patchJson(`/api/admin/gifts/${gift.id}/active`, { active: !gift.active });
    await loadGifts();
  }

  async function confirmDelete() {
    await del(`/api/admin/gifts/${deletingId}`);
    setDeletingId(null);
    await loadGifts();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="max-w-lg space-y-4 rounded-2xl bg-white/10 p-6">
        <h2 className="font-display text-xl font-extrabold">{editingId ? 'Edit gift' : 'Add gift'}</h2>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-name">
            Gift Name
          </label>
          <input
            id="gift-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            maxLength={100}
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-url">
            Gift URL
          </label>
          <input
            id="gift-url"
            type="url"
            value={form.productUrl}
            onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
            required
            placeholder="https://example.com/product"
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-price">
            Price <span className="font-normal text-white/60">(optional, e.g. "25 JOD")</span>
          </label>
          <input
            id="gift-price"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            maxLength={30}
            placeholder="e.g. 25 JOD"
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-price-range">
            Price range bucket <span className="font-normal text-white/60">(used to filter the wheel by guest budget)</span>
          </label>
          <select
            id="gift-price-range"
            value={form.priceRange}
            onChange={(e) => setForm((f) => ({ ...f, priceRange: e.target.value }))}
            className="w-full rounded-xl border-2 border-white/30 bg-white/10 px-4 py-2 outline-none focus:border-white"
          >
            <option value="" className="text-black">— none (eligible for any range) —</option>
            {PRICE_RANGES.map((r) => (
              <option key={r} value={r} className="text-black">
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold" htmlFor="gift-image">
            Gift Image
          </label>
          <input
            id="gift-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
            className="w-full text-sm"
          />
          {imagePreview && <img src={imagePreview} alt="Preview" className="mt-3 h-24 w-24 rounded-xl object-cover" />}
        </div>

        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            className="h-5 w-5"
          />
          Active
        </label>

        {error && <p className="font-semibold text-yellow-200">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="rounded-full bg-party-yellow px-6 py-3 font-extrabold text-purple-900">
            {editingId ? 'Save changes' : 'Add gift'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="rounded-full bg-white/20 px-6 py-3 font-bold">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/20 text-white/70">
              <th className="p-3">Image</th>
              <th className="p-3">Name</th>
              <th className="p-3">URL</th>
              <th className="p-3">Price</th>
              <th className="p-3">Range</th>
              <th className="p-3">Active</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gifts.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/60">
                  No gifts yet — add your first one above.
                </td>
              </tr>
            )}
            {gifts.map((gift) => (
              <tr key={gift.id} className="border-b border-white/10">
                <td className="p-3">
                  {gift.imageUrl ? (
                    <img src={gift.imageUrl} alt={gift.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <span className="text-white/40">—</span>
                  )}
                </td>
                <td className="p-3 font-bold">{gift.name}</td>
                <td className="max-w-[200px] truncate p-3">
                  <a href={gift.productUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    {gift.productUrl}
                  </a>
                </td>
                <td className="p-3">{gift.price || <span className="text-white/40">—</span>}</td>
                <td className="p-3">{gift.priceRange || <span className="text-white/40">any</span>}</td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(gift)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${gift.active ? 'bg-green-500' : 'bg-white/20'}`}
                  >
                    {gift.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(gift)}
                      className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingId(gift.id)}
                      className="rounded-full bg-red-500/80 px-3 py-1 text-xs font-bold"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete this gift?"
        description="This permanently removes the gift. Past participants who already won it keep their record, shown as '(gift removed)'."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
