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

async function handleApiResponse(res) {
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

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Session.token) headers.Authorization = `Bearer ${Session.token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleApiResponse(res);
}

// Para upload de arquivos (multipart/form-data) — não define Content-Type
// manualmente, o navegador precisa gerar o boundary correto sozinho.
async function apiUpload(path, formData, { method = 'POST' } = {}) {
  const headers = {};
  if (Session.token) headers.Authorization = `Bearer ${Session.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: formData });
  return handleApiResponse(res);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Apelido tem prioridade sobre o nome de usuário para exibição.
function displayNameOf(user) {
  return (user && (user.displayName || user.username)) || '?';
}

// <img> se tiver avatarUrl, senão um círculo com a inicial do nome.
function avatarHtml(user, sizeClass = 'avatar-md') {
  const name = displayNameOf(user);
  if (user && user.avatarUrl) {
    return `<img class="avatar ${sizeClass}" src="${escapeHtml(user.avatarUrl)}" alt="" />`;
  }
  return `<span class="avatar ${sizeClass}">${escapeHtml(name.trim().charAt(0) || '?')}</span>`;
}
