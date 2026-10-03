const GEO_TIMEOUT_MS = 1500;

// Best-effort IP -> country lookup. Hostinger's edge doesn't inject a
// country header for us (confirmed via a temporary debug endpoint hitting
// the live site), so this calls a third-party geolocation API instead.
// Never throws — any failure, timeout, or unrecognized IP just resolves to
// null, so a flaky lookup can never block a spin.
export async function resolveCountry(ip) {
  if (!ip) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success') return null;
    return data.countryCode ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
