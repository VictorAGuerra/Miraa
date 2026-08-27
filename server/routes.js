const express = require('express');
const { rateLimit } = require('express-rate-limit');
const store = require('./store');
const auth = require('./auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// Limite grosseiro contra criação em massa de contas a partir do mesmo IP.
// Não impede alguém decidido (VPN, trocar de rede, etc.), só freia abuso
// casual/automatizado.
const registerLimiter = rateLimit({
  windowMs: 6 * 60 * 60 * 1000, // 6 horas
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas contas criadas curto intervalo de tempo. Tente novamente mais tarde.' },
});

function passwordRequirementErrors(password) {
  if (typeof password !== 'string') return ['a senha é obrigatória'];
  const missing = [];
  if (password.length < 8) missing.push('pelo menos 8 caracteres');
  if (!/[A-Z]/.test(password)) missing.push('uma letra maiúscula');
  if (!/[0-9]/.test(password)) missing.push('um número');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('um caractere especial');
  return missing;
}

function router(io) {
  const r = express.Router();

  // Empurra um evento leve para todas as abas/dispositivos logados de um
  // usuário; o cliente reage apenas re-buscando a lista via REST (sem
  // precisar sincronizar payloads parciais).
  function notify(userIds, event) {
    for (const id of userIds) io.to(`user:${id}`).emit(event);
  }

  // ---------- Autenticação ----------

  r.post('/register', registerLimiter, (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Usuário deve ter 3-20 caracteres (letras, números, _).' });
    }
    const missingRules = passwordRequirementErrors(password);
    if (missingRules.length) {
      return res.status(400).json({ error: `A senha precisa ter: ${missingRules.join(', ')}.` });
    }
    if (store.findUserByUsername(username)) {
      return res.status(409).json({ error: 'Esse nome de usuário já está em uso.' });
    }
    const user = store.createUser(username, password);
    const token = auth.createToken(user.id);
    res.status(201).json({ token, user: store.publicUser(user) });
  });

  r.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = typeof username === 'string' ? store.findUserByUsername(username) : null;
    if (!user || !store.verifyPassword(user, password || '')) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    const token = auth.createToken(user.id);
    res.json({ token, user: store.publicUser(user) });
  });

  r.post('/logout', auth.requireAuth, (req, res) => {
    auth.revokeToken(req.token);
    res.status(204).end();
  });

  r.get('/me', auth.requireAuth, (req, res) => {
    res.json({ user: store.publicUser(store.findUserById(req.userId)) });
  });

  // ---------- Amigos ----------

  r.get('/friends', auth.requireAuth, (req, res) => {
    res.json({ friends: store.listFriends(req.userId) });
  });

  r.get('/friends/requests', auth.requireAuth, (req, res) => {
    res.json(store.listRequests(req.userId));
  });

  r.post('/friends/request', auth.requireAuth, (req, res) => {
    const { uuid } = req.body || {};
    if (typeof uuid !== 'string' || !UUID_RE.test(uuid.trim())) {
      return res.status(400).json({ error: 'Informe um UUID válido.' });
    }
    try {
      const result = store.sendFriendRequest(req.userId, uuid.trim());
      notify([req.userId, uuid.trim()], 'friends:updated');
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  r.post('/friends/requests/:id/accept', auth.requireAuth, (req, res) => {
    try {
      const request = store.acceptRequest(req.params.id, req.userId);
      notify([req.userId, request.from], 'friends:updated');
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  r.post('/friends/requests/:id/reject', auth.requireAuth, (req, res) => {
    try {
      const request = store.rejectRequest(req.params.id, req.userId);
      notify([request.from, request.to], 'friends:updated');
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  r.delete('/friends/:friendId', auth.requireAuth, (req, res) => {
    store.removeFriend(req.userId, req.params.friendId);
    notify([req.userId, req.params.friendId], 'friends:updated');
    res.status(204).end();
  });

  // ---------- Salas ----------

  r.get('/rooms', auth.requireAuth, (req, res) => {
    const rooms = store.listRoomsForUser(req.userId).map(store.roomWithMembers);
    res.json({ rooms });
  });

  r.post('/rooms', auth.requireAuth, (req, res) => {
    const { name, memberIds } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'A sala precisa de um nome.' });
    }
    const room = store.createRoom(req.userId, name, Array.isArray(memberIds) ? memberIds : []);
    notify(room.memberIds, 'rooms:updated');
    res.status(201).json({ room: store.roomWithMembers(room) });
  });

  r.get('/rooms/:id', auth.requireAuth, (req, res) => {
    const room = store.getRoom(req.params.id);
    if (!room || !store.isRoomMember(req.params.id, req.userId)) {
      return res.status(404).json({ error: 'Sala não encontrada.' });
    }
    res.json({ room: store.roomWithMembers(room) });
  });

  r.post('/rooms/:id/invite', auth.requireAuth, (req, res) => {
    const { friendId } = req.body || {};
    try {
      const room = store.inviteToRoom(req.params.id, req.userId, friendId);
      notify(room.memberIds, 'rooms:updated');
      res.json({ room: store.roomWithMembers(room) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  r.post('/rooms/:id/leave', auth.requireAuth, (req, res) => {
    try {
      const room = store.leaveRoom(req.params.id, req.userId);
      notify([req.userId, ...room.memberIds], 'rooms:updated');
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  r.delete('/rooms/:id', auth.requireAuth, (req, res) => {
    try {
      const room = store.deleteRoom(req.params.id, req.userId);
      notify(room.memberIds, 'rooms:updated');
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return r;
}

module.exports = router;
