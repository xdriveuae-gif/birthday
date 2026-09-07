const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'UNKNOWN', err.message ?? 'Something went wrong.');
  }
  return body;
}

export async function getJson(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  return parseResponse(res);
}

export async function postJson(path, data) {
  const res = await fetch(path, {
    method: 'POST',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function putJson(path, data) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function patchJson(path, data) {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    credentials: 'same-origin',
    body: JSON.stringify(data),
  });
  return parseResponse(res);
}

export async function del(path) {
  const res = await fetch(path, { method: 'DELETE', credentials: 'same-origin' });
  return parseResponse(res);
}

export async function postForm(path, formData) {
  const res = await fetch(path, { method: 'POST', credentials: 'same-origin', body: formData });
  return parseResponse(res);
}

export async function putForm(path, formData) {
  const res = await fetch(path, { method: 'PUT', credentials: 'same-origin', body: formData });
  return parseResponse(res);
}
