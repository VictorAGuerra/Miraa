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

const CHECK_ICON = `<svg class="check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const LOGIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>`;
const LOGOUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>`;
const USERS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
const USER_MINUS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;

// Modal de confirmação genérico — devolve uma Promise<boolean>.
const confirmModal = document.getElementById('confirm-modal');
function askConfirmation({ title = 'Tem certeza?', message = '', confirmLabel = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
    const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
    confirmBtn.textContent = confirmLabel;

    function cleanup(result) {
      confirmModal.classList.add('hidden');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    confirmModal.classList.remove('hidden');
  });
}

// Preenche um .friend-picker com botões marcáveis (um por amigo). Usado no
// "criar sala" e no "gerenciar membros".
function renderFriendPicker(container, friends, emptyMessage) {
  container.innerHTML = friends.length
    ? ''
    : `<span class="muted" style="font-size:0.85rem;">${emptyMessage}</span>`;
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
    container.appendChild(btn);
  }
}

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
        <button class="icon-action-btn danger-icon" data-remove="${f.id}" title="Remover amigo" aria-label="Remover amigo">${USER_MINUS_ICON}</button>
      </div>`;
    list.appendChild(item);
  }
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.closest('.list-item')?.querySelector('strong')?.textContent || 'este amigo';
      const ok = await askConfirmation({
        title: 'Remover amigo',
        message: `Tem certeza que deseja remover ${name} da sua lista de amigos?`,
        confirmLabel: 'Remover',
      });
      if (!ok) return;
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
  const ownRooms = rooms.filter((r) => r.ownerId === me.id);
  const friendsRooms = rooms.filter((r) => r.ownerId !== me.id);
  renderRoomList(document.getElementById('own-rooms-list'), ownRooms, true, 'Você ainda não criou nenhuma sala.');
  renderRoomList(document.getElementById('friends-rooms-list'), friendsRooms, false, 'Nenhum amigo te convidou para uma sala ainda.');
}

function renderRoomList(list, rooms, isOwnerList, emptyMessage) {
  list.innerHTML = '';
  if (!rooms.length) {
    list.innerHTML = `<div class="empty-hint">${emptyMessage}</div>`;
    return;
  }
  for (const room of rooms) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="info">
        <strong>${escapeHtml(room.name)}</strong>
        <span>${room.members.length} membro(s)</span>
      </div>
      <div class="actions">
        <button class="icon-action-btn primary-icon" data-enter="${room.id}" title="Entrar" aria-label="Entrar">${LOGIN_ICON}</button>
        ${isOwnerList
          ? `<button class="icon-action-btn" data-manage="${room.id}" title="Membros" aria-label="Membros">${USERS_ICON}</button>
             <button class="icon-action-btn danger-icon" data-delete="${room.id}" title="Excluir sala" aria-label="Excluir sala">${TRASH_ICON}</button>`
          : `<button class="icon-action-btn" data-leave="${room.id}" title="Sair da sala" aria-label="Sair da sala">${LOGOUT_ICON}</button>`}
      </div>`;
    list.appendChild(item);
  }
  list.querySelectorAll('[data-enter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `/room.html?id=${encodeURIComponent(btn.dataset.enter)}`;
    });
  });
  list.querySelectorAll('[data-manage]').forEach((btn) => {
    btn.addEventListener('click', () => openManageMembers(btn.dataset.manage));
  });
  list.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.closest('.list-item')?.querySelector('strong')?.textContent || 'esta sala';
      const ok = await askConfirmation({
        title: 'Excluir sala',
        message: `Tem certeza que deseja excluir "${name}"? Isso remove o acesso de todos os membros.`,
        confirmLabel: 'Excluir',
      });
      if (!ok) return;
      await api(`/rooms/${btn.dataset.delete}`, { method: 'DELETE' });
      await refreshAll();
    });
  });
  list.querySelectorAll('[data-leave]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.closest('.list-item')?.querySelector('strong')?.textContent || 'esta sala';
      const ok = await askConfirmation({
        title: 'Sair da sala',
        message: `Tem certeza que deseja sair de "${name}"?`,
        confirmLabel: 'Sair',
      });
      if (!ok) return;
      await api(`/rooms/${btn.dataset.leave}/leave`, { method: 'POST' });
      await refreshAll();
    });
  });
}

// ---------- Modal de gerenciar membros ----------

const manageMembersModal = document.getElementById('manage-members-modal');
let manageRoomId = null;

async function openManageMembers(roomId) {
  manageRoomId = roomId;
  document.getElementById('manage-members-error').textContent = '';
  await renderManageMembers();
  manageMembersModal.classList.remove('hidden');
}

async function renderManageMembers() {
  const errorEl = document.getElementById('manage-members-error');
  let room;
  try {
    ({ room } = await api(`/rooms/${manageRoomId}`));
  } catch (err) {
    errorEl.textContent = err.message;
    return;
  }

  const currentList = document.getElementById('current-members-list');
  currentList.innerHTML = '';
  for (const member of room.members) {
    const isRoomOwner = member.id === room.ownerId;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      ${friendRowInfo(member)}
      <div class="actions">
        ${isRoomOwner
          ? '<span class="muted" style="font-size:0.8rem;">dono</span>'
          : `<button class="icon-action-btn danger-icon" data-kick="${member.id}" title="Remover da sala" aria-label="Remover da sala">${USER_MINUS_ICON}</button>`}
      </div>`;
    currentList.appendChild(item);
  }
  currentList.querySelectorAll('[data-kick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.closest('.list-item')?.querySelector('strong')?.textContent || 'este membro';
      const ok = await askConfirmation({
        title: 'Remover membro',
        message: `Tem certeza que deseja remover ${name} desta sala?`,
        confirmLabel: 'Remover',
      });
      if (!ok) return;
      try {
        await api(`/rooms/${manageRoomId}/members/${btn.dataset.kick}`, { method: 'DELETE' });
        await renderManageMembers();
        await refreshAll();
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });
  });

  const { friends } = await api('/friends');
  const memberIds = new Set(room.members.map((m) => m.id));
  const invitable = friends.filter((f) => !memberIds.has(f.id));
  renderFriendPicker(
    document.getElementById('manage-friend-picker'),
    invitable,
    friends.length ? 'Todos os seus amigos já estão nesta sala.' : 'Adicione amigos para convidá-los.',
  );
}

document.getElementById('close-manage-members-btn').addEventListener('click', () => {
  manageMembersModal.classList.add('hidden');
});

document.getElementById('invite-selected-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('manage-members-error');
  errorEl.textContent = '';
  const friendIds = Array.from(document.querySelectorAll('#manage-friend-picker .friend-pick.selected'))
    .map((el) => el.dataset.id);
  try {
    for (const friendId of friendIds) {
      await api(`/rooms/${manageRoomId}/invite`, { method: 'POST', body: { friendId } });
    }
    await renderManageMembers();
    await refreshAll();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Modal de criação de sala ----------

const modal = document.getElementById('create-room-modal');

document.getElementById('open-create-room').addEventListener('click', async () => {
  document.getElementById('room-name-input').value = '';
  document.getElementById('create-room-error').textContent = '';
  const { friends } = await api('/friends');
  renderFriendPicker(document.getElementById('room-friend-picker'), friends, 'Adicione amigos para convidá-los.');
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
