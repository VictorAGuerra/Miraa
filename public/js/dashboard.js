let me = Session.requireOrRedirect();

document.getElementById('uuid-text').textContent = me.id;

function renderSelfTrigger() {
  document.getElementById('self-avatar').innerHTML = avatarHtml(me, 'avatar-sm');
  document.getElementById('username-label').textContent = displayNameOf(me);
}
renderSelfTrigger();

// Sessão pode ter sido salva antes de apelido/avatar existirem, ou estar
// desatualizada — busca o perfil atual assim que a página carrega.
(async () => {
  try {
    const { user } = await api('/me');
    me = user;
    Session.save(Session.token, me);
    renderSelfTrigger();
  } catch { /* mantém o que já tinha em cache */ }
})();

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

// ---------- Perfil ----------

const profileModal = document.getElementById('profile-modal');
let selectedAvatarFile = null;

document.getElementById('open-profile').addEventListener('click', () => {
  selectedAvatarFile = null;
  document.getElementById('profile-displayname-input').value = me.displayName || '';
  document.getElementById('profile-avatar-preview').innerHTML = avatarHtml(me, 'avatar-lg');
  document.getElementById('profile-error').textContent = '';
  profileModal.classList.remove('hidden');
});

document.getElementById('cancel-profile-btn').addEventListener('click', () => profileModal.classList.add('hidden'));

document.getElementById('profile-avatar-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedAvatarFile = file;
  const preview = document.getElementById('profile-avatar-preview');
  const reader = new FileReader();
  reader.onload = () => {
    preview.innerHTML = `<img class="avatar avatar-lg" src="${reader.result}" alt="" />`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('remove-avatar-btn').addEventListener('click', async () => {
  try {
    const { user } = await api('/profile/avatar', { method: 'DELETE' });
    me = user;
    Session.save(Session.token, me);
    selectedAvatarFile = null;
    document.getElementById('profile-avatar-input').value = '';
    document.getElementById('profile-avatar-preview').innerHTML = avatarHtml(me, 'avatar-lg');
    renderSelfTrigger();
    toast('Foto removida.');
  } catch (err) {
    document.getElementById('profile-error').textContent = err.message;
  }
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('profile-error');
  errorEl.textContent = '';
  const displayName = document.getElementById('profile-displayname-input').value.trim();

  try {
    if (selectedAvatarFile) {
      const formData = new FormData();
      formData.append('avatar', selectedAvatarFile);
      const { user } = await apiUpload('/profile/avatar', formData);
      me = user;
    }
    const { user } = await api('/profile', { method: 'PATCH', body: { displayName: displayName || null } });
    me = user;
    Session.save(Session.token, me);
    renderSelfTrigger();
    profileModal.classList.add('hidden');
    await refreshAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Amigos ----------

function friendRowInfo(user) {
  return `
    <div class="identity">
      ${avatarHtml(user, 'avatar-md')}
      <div class="info">
        <strong>${escapeHtml(displayNameOf(user))}</strong>
        <span>@${escapeHtml(user.username)}</span>
      </div>
    </div>`;
}

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
      ${friendRowInfo(f)}
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
      ${friendRowInfo(r.user)}
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
      ${friendRowInfo(r.user)}
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
  const CHECK_ICON = `<svg class="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  for (const f of friends) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'friend-pick';
    btn.dataset.id = f.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `${avatarHtml(f, 'avatar-sm')} <span>${escapeHtml(displayNameOf(f))}</span> ${CHECK_ICON}`;
    btn.addEventListener('click', () => {
      const selected = btn.classList.toggle('selected');
      btn.setAttribute('aria-pressed', String(selected));
    });
    picker.appendChild(btn);
  }
  modal.classList.remove('hidden');
});

document.getElementById('cancel-create-room').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('confirm-create-room').addEventListener('click', async () => {
  const name = document.getElementById('room-name-input').value.trim();
  const errorEl = document.getElementById('create-room-error');
  if (!name) { errorEl.textContent = 'Dê um nome à sala.'; return; }
  const memberIds = Array.from(document.querySelectorAll('#room-friend-picker .friend-pick.selected')).map((el) => el.dataset.id);
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

// Atualiza a tela em tempo real (sem F5) quando algo muda: pedido de
// amizade recebido/aceito, convite pra sala, apelido/foto de um amigo, etc.
// O servidor só avisa "algo mudou" — a gente reage re-buscando a lista.
const socket = io({ auth: { token: Session.token } });
socket.on('friends:updated', () => {
  loadFriends();
  loadRequests();
});
socket.on('rooms:updated', () => {
  loadRooms();
});
