// Pequeno wrapper de fetch com autenticação por token (localStorage).
const Session = {
  get token() { return localStorage.getItem('miraa_token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('miraa_user') || 'null'); }
    catch { return null; }
  },
  save(token, user) {
    localStorage.setItem('miraa_token', token);
    localStorage.setItem('miraa_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('miraa_token');
    localStorage.removeItem('miraa_user');
  },
  requireOrRedirect() {
    if (!this.token || !this.user) {
      window.location.href = '/index.html';
      return null;
    }
    return this.user;
  },
};

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Session.token) headers.Authorization = `Bearer ${Session.token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    Session.clear();
    window.location.href = '/index.html';
    throw new Error('Sessão expirada.');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Erro ${res.status}`);
  }
  return data;
}
