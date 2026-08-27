const store = require('./store');
const auth = require('./auth');

// socket.id -> { userId, username, roomId }
const peers = new Map();

function roomChannel(roomId) {
  return `room:${roomId}`;
}

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const userId = auth.getUserId(token);
    const user = userId && store.findUserById(userId);
    if (!user) return next(new Error('Não autenticado.'));
    socket.userId = user.id;
    socket.username = user.username;
    next();
  });

  io.on('connection', (socket) => {
    // Canal pessoal do usuário — usado para empurrar notificações (pedido de
    // amizade, convite de sala, etc.) em tempo real, independente de estar
    // numa sala. Todas as abas/dispositivos logados do mesmo usuário entram
    // aqui, então todos recebem a notificação.
    socket.join(`user:${socket.userId}`);

    socket.on('room:join', (payload, ack) => {
      const roomId = payload && payload.roomId;
      if (!store.isRoomMember(roomId, socket.userId)) {
        if (typeof ack === 'function') ack({ error: 'Você não é membro desta sala.' });
        return;
      }

      const channel = roomChannel(roomId);
      const existingPeers = Array.from(peers.entries())
        .filter(([, p]) => p.roomId === roomId)
        .map(([socketId, p]) => ({ socketId, userId: p.userId, username: p.username }));

      peers.set(socket.id, { userId: socket.userId, username: socket.username, roomId });
      socket.join(channel);

      if (typeof ack === 'function') {
        ack({ peers: existingPeers, self: { socketId: socket.id, userId: socket.userId, username: socket.username } });
      }

      socket.to(channel).emit('room:peer-joined', {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
      });
    });

    socket.on('signal', ({ to, data } = {}) => {
      if (!to || !peers.has(socket.id)) return;
      io.to(to).emit('signal', { from: socket.id, data });
    });

    socket.on('stream:meta', (meta = {}) => {
      const info = peers.get(socket.id);
      if (!info) return;
      socket.to(roomChannel(info.roomId)).emit('stream:meta', { ...meta, socketId: socket.id });
    });

    function leaveCurrentRoom() {
      const info = peers.get(socket.id);
      if (!info) return;
      peers.delete(socket.id);
      socket.to(roomChannel(info.roomId)).emit('room:peer-left', { socketId: socket.id });
      socket.leave(roomChannel(info.roomId));
    }

    socket.on('room:leave', leaveCurrentRoom);
    socket.on('disconnect', leaveCurrentRoom);
  });
}

module.exports = setupSocket;
