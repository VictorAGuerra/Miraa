const me = Session.requireOrRedirect();

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

document.getElementById('username-label').textContent = me.username;
document.getElementById('uuid-text').textContent = me.id;

document.getElementById('copy-uuid').addEventListener('click', async () => {
  await navigator.clipboard.writeText(me.id);
  toast('UUID copiado!');
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
  Session.clear();
  window.location.href = '/index.html';
});

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ---------- Amigos ----------

async function loadFriends() {
  const { friends } = await api('/friends');
  const list = document.getElementById('friends-list');
  list.innerHTML = '';
  if (!friends.length) {
    list.innerHTML = '<div class="empty-hint">Você ainda não tem amigos. Compartilhe seu UUID!</div>';
    return;
  }
  for (const f of friends) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="info">
        <strong>${escapeHtml(f.username)}</strong>
        <span>${f.id}</span>
      </div>
      <div class="actions">
        <button class="danger" data-remove="${f.id}">Remover</button>
      </div>`;
    list.appendChild(item);
  }
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/friends/${btn.dataset.remove}`, { method: 'DELETE' });
      await refreshAll();
    });
  });
}

async function loadRequests() {
  const { incoming, outgoing } = await api('/friends/requests');

  const incomingList = document.getElementById('incoming-list');
  incomingList.innerHTML = incoming.length
    ? ''
    : '<div class="empty-hint">Nenhum pedido recebido.</div>';
  for (const r of incoming) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="info"><strong>${escapeHtml(r.user.username)}</strong><span>${r.user.id}</span></div>
      <div class="actions">
        <button data-accept="${r.id}">Aceitar</button>
        <button class="secondary" data-reject="${r.id}">Recusar</button>
      </div>`;
    incomingList.appendChild(item);
  }
  incomingList.querySelectorAll('[data-accept]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/friends/requests/${btn.dataset.accept}/accept`, { method: 'POST' });
      await refreshAll();
    });
  });
  incomingList.querySelectorAll('[data-reject]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/friends/requests/${btn.dataset.reject}/reject`, { method: 'POST' });
      await refreshAll();
    });
  });

  const outgoingList = document.getElementById('outgoing-list');
  outgoingList.innerHTML = outgoing.length
    ? ''
    : '<div class="empty-hint">Nenhum pedido pendente.</div>';
  for (const r of outgoing) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="info"><strong>${escapeHtml(r.user.username)}</strong><span>${r.user.id}</span></div>
      <div class="actions"><span class="muted">Aguardando...</span></div>`;
    outgoingList.appendChild(item);
  }
}

document.getElementById('send-request-btn').addEventListener('click', async () => {
  const input = document.getElementById('friend-uuid-input');
  const msg = document.getElementById('friend-request-msg');
  msg.textContent = '';
  msg.classList.remove('success-msg');
  msg.classList.add('error-msg');
  try {
    const result = await api('/friends/request', { method: 'POST', body: { uuid: input.value.trim() } });
    input.value = '';
    msg.classList.remove('error-msg');
    msg.classList.add('success-msg');
    msg.textContent = result.autoAccepted ? 'Vocês agora são amigos!' : 'Pedido enviado!';
    await refreshAll();
  } catch (err) {
    msg.textContent = err.message;
  }
});

// ---------- Salas ----------

async function loadRooms() {
  const { rooms } = await api('/rooms');
  const list = document.getElementById('rooms-list');
  list.innerHTML = '';
  if (!rooms.length) {
    list.innerHTML = '<div class="empty-hint">Nenhuma sala ainda. Crie uma watch party!</div>';
    return;
  }
  for (const room of rooms) {
    const isOwner = room.ownerId === me.id;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="info">
        <strong>${escapeHtml(room.name)}</strong>
        <span>${room.members.length} membro(s)${isOwner ? ' · você é o dono' : ''}</span>
      </div>
      <div class="actions">
        <button data-enter="${room.id}">Entrar</button>
        ${isOwner
          ? `<button class="danger" data-delete="${room.id}">Excluir</button>`
          : `<button class="secondary" data-leave="${room.id}">Sair</button>`}
      </div>`;
    list.appendChild(item);
  }
  list.querySelectorAll('[data-enter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `/room.html?id=${encodeURIComponent(btn.dataset.enter)}`;
    });
  });
  list.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta sala para todos os membros?')) return;
      await api(`/rooms/${btn.dataset.delete}`, { method: 'DELETE' });
      await refreshAll();
    });
  });
  list.querySelectorAll('[data-leave]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/rooms/${btn.dataset.leave}/leave`, { method: 'POST' });
      await refreshAll();
    });
  });
}

// ---------- Modal de criação de sala ----------

const modal = document.getElementById('create-room-modal');

document.getElementById('open-create-room').addEventListener('click', async () => {
  document.getElementById('room-name-input').value = '';
  document.getElementById('create-room-error').textContent = '';
  const { friends } = await api('/friends');
  const picker = document.getElementById('room-friend-picker');
  picker.innerHTML = friends.length
    ? ''
    : '<span class="muted" style="font-size:0.85rem;">Adicione amigos para convidá-los.</span>';
  for (const f of friends) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${f.id}" /> ${escapeHtml(f.username)}`;
    picker.appendChild(label);
  }
  modal.classList.remove('hidden');
});

document.getElementById('cancel-create-room').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('confirm-create-room').addEventListener('click', async () => {
  const name = document.getElementById('room-name-input').value.trim();
  const errorEl = document.getElementById('create-room-error');
  if (!name) { errorEl.textContent = 'Dê um nome à sala.'; return; }
  const memberIds = Array.from(document.querySelectorAll('#room-friend-picker input:checked')).map((c) => c.value);
  try {
    const { room } = await api('/rooms', { method: 'POST', body: { name, memberIds } });
    modal.classList.add('hidden');
    window.location.href = `/room.html?id=${encodeURIComponent(room.id)}`;
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

async function refreshAll() {
  await Promise.all([loadFriends(), loadRequests(), loadRooms()]);
}

refreshAll();
