const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { state, persist } = require('./db');

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || null,
    avatarUrl: user.hasAvatar ? `/api/avatars/${user.id}?v=${user.avatarVersion}` : null,
    createdAt: user.createdAt,
  };
}

// ---------- Usuários ----------

function findUserByUsername(username) {
  const lower = username.trim().toLowerCase();
  return Object.values(state.users).find((u) => u.usernameLower === lower) || null;
}

function findUserById(id) {
  return state.users[id] || null;
}

function createUser(username, password) {
  const id = crypto.randomUUID();
  const user = {
    id,
    username: username.trim(),
    usernameLower: username.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: Date.now(),
    displayName: null,
    hasAvatar: false,
    avatarVersion: 0,
    avatarMimeType: null,
  };
  state.users[id] = user;
  state.friends[id] = [];
  persist();
  return user;
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.passwordHash);
}

function updateDisplayName(userId, displayName) {
  const user = findUserById(userId);
  if (!user) throw new Error('Usuário não encontrado.');
  user.displayName = displayName ? displayName.trim() : null;
  persist();
  return user;
}

function setAvatar(userId, mimeType) {
  const user = findUserById(userId);
  if (!user) throw new Error('Usuário não encontrado.');
  user.hasAvatar = true;
  user.avatarMimeType = mimeType;
  user.avatarVersion += 1;
  persist();
  return user;
}

function clearAvatar(userId) {
  const user = findUserById(userId);
  if (!user) throw new Error('Usuário não encontrado.');
  user.hasAvatar = false;
  user.avatarMimeType = null;
  persist();
  return user;
}

// ---------- Amigos ----------

function areFriends(aId, bId) {
  return (state.friends[aId] || []).includes(bId);
}

function listFriends(userId) {
  return (state.friends[userId] || []).map((id) => publicUser(findUserById(id))).filter(Boolean);
}

function friendIds(userId) {
  return state.friends[userId] || [];
}

function findPendingRequestBetween(aId, bId) {
  return Object.values(state.friendRequests).find(
    (r) => r.status === 'pending' &&
      ((r.from === aId && r.to === bId) || (r.from === bId && r.to === aId))
  ) || null;
}

function addMutualFriends(aId, bId) {
  state.friends[aId] = state.friends[aId] || [];
  state.friends[bId] = state.friends[bId] || [];
  if (!state.friends[aId].includes(bId)) state.friends[aId].push(bId);
  if (!state.friends[bId].includes(aId)) state.friends[bId].push(aId);
}

function sendFriendRequest(fromId, toId) {
  if (fromId === toId) throw new Error('Você não pode adicionar a si mesmo.');
  const target = findUserById(toId);
  if (!target) throw new Error('Nenhum usuário encontrado com esse UUID.');
  if (areFriends(fromId, toId)) throw new Error('Vocês já são amigos.');

  const existing = findPendingRequestBetween(fromId, toId);
  if (existing) {
    if (existing.from === toId) {
      // O outro usuário já havia te enviado um pedido: aceita automaticamente.
      existing.status = 'accepted';
      addMutualFriends(fromId, toId);
      persist();
      return { autoAccepted: true, request: existing };
    }
    throw new Error('Você já enviou um pedido de amizade para este usuário.');
  }

  const id = crypto.randomUUID();
  const request = { id, from: fromId, to: toId, status: 'pending', createdAt: Date.now() };
  state.friendRequests[id] = request;
  persist();
  return { autoAccepted: false, request };
}

function listRequests(userId) {
  const all = Object.values(state.friendRequests).filter((r) => r.status === 'pending');
  const incoming = all
    .filter((r) => r.to === userId)
    .map((r) => ({ id: r.id, user: publicUser(findUserById(r.from)), createdAt: r.createdAt }));
  const outgoing = all
    .filter((r) => r.from === userId)
    .map((r) => ({ id: r.id, user: publicUser(findUserById(r.to)), createdAt: r.createdAt }));
  return { incoming, outgoing };
}

function acceptRequest(requestId, userId) {
  const req = state.friendRequests[requestId];
  if (!req || req.status !== 'pending' || req.to !== userId) {
    throw new Error('Pedido de amizade não encontrado.');
  }
  req.status = 'accepted';
  addMutualFriends(req.from, req.to);
  delete state.friendRequests[requestId];
  persist();
  return req;
}

function rejectRequest(requestId, userId) {
  const req = state.friendRequests[requestId];
  if (!req || req.status !== 'pending' || (req.to !== userId && req.from !== userId)) {
    throw new Error('Pedido de amizade não encontrado.');
  }
  delete state.friendRequests[requestId];
  persist();
  return req;
}

function removeFriend(userId, friendId) {
  state.friends[userId] = (state.friends[userId] || []).filter((id) => id !== friendId);
  state.friends[friendId] = (state.friends[friendId] || []).filter((id) => id !== userId);
  persist();
}

// ---------- Salas ----------

function createRoom(ownerId, name, memberIds = []) {
  const id = crypto.randomUUID();
  const validMembers = memberIds.filter((mid) => areFriends(ownerId, mid) && mid !== ownerId);
  const room = {
    id,
    name: name.trim(),
    ownerId,
    memberIds: [ownerId, ...validMembers],
    createdAt: Date.now(),
  };
  state.rooms[id] = room;
  persist();
  return room;
}

function getRoom(roomId) {
  return state.rooms[roomId] || null;
}

function isRoomMember(roomId, userId) {
  const room = getRoom(roomId);
  return !!room && room.memberIds.includes(userId);
}

function listRoomsForUser(userId) {
  return Object.values(state.rooms).filter((r) => r.memberIds.includes(userId));
}

function inviteToRoom(roomId, ownerId, friendId) {
  const room = getRoom(roomId);
  if (!room) throw new Error('Sala não encontrada.');
  if (room.ownerId !== ownerId) throw new Error('Apenas o dono da sala pode convidar.');
  if (!areFriends(ownerId, friendId)) throw new Error('Você só pode convidar amigos.');
  if (!room.memberIds.includes(friendId)) room.memberIds.push(friendId);
  persist();
  return room;
}

function leaveRoom(roomId, userId) {
  const room = getRoom(roomId);
  if (!room) throw new Error('Sala não encontrada.');
  if (room.ownerId === userId) throw new Error('O dono não pode sair; exclua a sala.');
  room.memberIds = room.memberIds.filter((id) => id !== userId);
  persist();
  return room;
}

function deleteRoom(roomId, userId) {
  const room = getRoom(roomId);
  if (!room) throw new Error('Sala não encontrada.');
  if (room.ownerId !== userId) throw new Error('Apenas o dono pode excluir a sala.');
  delete state.rooms[roomId];
  persist();
  return room;
}

function roomWithMembers(room) {
  return { ...room, members: room.memberIds.map((id) => publicUser(findUserById(id))).filter(Boolean) };
}

module.exports = {
  publicUser,
  findUserByUsername,
  findUserById,
  createUser,
  verifyPassword,
  updateDisplayName,
  setAvatar,
  clearAvatar,
  areFriends,
  listFriends,
  friendIds,
  sendFriendRequest,
  listRequests,
  acceptRequest,
  rejectRequest,
  removeFriend,
  createRoom,
  getRoom,
  isRoomMember,
  listRoomsForUser,
  inviteToRoom,
  leaveRoom,
  deleteRoom,
  roomWithMembers,
};
