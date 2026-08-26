const me = Session.requireOrRedirect();

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const KIND_LABELS = { camera: 'Câmera', mic: 'Microfone', screen: 'Tela' };

const params = new URLSearchParams(window.location.search);
const roomId = params.get('id');
if (!roomId) window.location.href = '/dashboard.html';

const statusLine = document.getElementById('status-line');
const videoGrid = document.getElementById('video-grid');

function setStatus(msg) { statusLine.textContent = msg; }

// kind -> MediaStream | null
const localStreams = { camera: null, mic: null, screen: null };
// kind -> HTMLElement (local preview tile), only for video kinds
const localTiles = {};

// socketId -> { userId, username }
const peerInfoBySocket = new Map();
// socketId -> { pc, polite, makingOffer, ignoreOffer, senders: {camera:[],mic:[],screen:[]}, remoteUsername }
const peerConnections = new Map();
// streamId -> { kind, username }
const remoteStreamMeta = new Map();
// `${socketId}:${streamId}` -> { tile, video, badge, label }
const tiles = new Map();

// ---------- UI: tiles ----------

function tileKey(socketId, streamId) { return `${socketId}:${streamId}`; }

function ensureRemoteTile(socketId, stream, username) {
  const key = tileKey(socketId, stream.id);
  if (tiles.has(key)) return tiles.get(key);
  const tile = document.createElement('div');
  tile.className = 'tile';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  const badge = document.createElement('span');
  badge.className = 'kind-badge';
  badge.textContent = '...';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = username || 'Participante';
  tile.append(video, badge, label);
  videoGrid.appendChild(tile);
  const record = { tile, video, badge, label };
  tiles.set(key, record);
  return record;
}

function removeTile(socketId, streamId) {
  const key = tileKey(socketId, streamId);
  const record = tiles.get(key);
  if (record) {
    record.tile.remove();
    tiles.delete(key);
  }
}

function removeTilesForSocket(socketId) {
  for (const key of Array.from(tiles.keys())) {
    if (key.startsWith(`${socketId}:`)) {
      tiles.get(key).tile.remove();
      tiles.delete(key);
    }
  }
}

function applyMetaToTile(socketId, streamId) {
  const meta = remoteStreamMeta.get(streamId);
  const record = tiles.get(tileKey(socketId, streamId));
  if (record && meta) {
    record.badge.textContent = KIND_LABELS[meta.kind] || meta.kind;
    record.label.textContent = meta.username || peerInfoBySocket.get(socketId)?.username || 'Participante';
  }
}

function showLocalPreview(kind, stream) {
  removeLocalPreview(kind);
  const tile = document.createElement('div');
  tile.className = 'tile';
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // evita eco do próprio áudio
  video.srcObject = stream;
  const badge = document.createElement('span');
  badge.className = 'kind-badge';
  badge.textContent = KIND_LABELS[kind];
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = `Você (${KIND_LABELS[kind]})`;
  tile.append(video, badge, label);
  videoGrid.prepend(tile);
  localTiles[kind] = tile;
}

function removeLocalPreview(kind) {
  if (localTiles[kind]) {
    localTiles[kind].remove();
    delete localTiles[kind];
  }
}

function updateButtonState(kind, active) {
  const map = { camera: 'toggle-camera', mic: 'toggle-mic', screen: 'toggle-screen' };
  const btn = document.getElementById(map[kind]);
  if (btn) btn.classList.toggle('toggle-active', active);
}

// ---------- WebRTC ----------

function createPeerConnection(socketId, remoteUserId, remoteUsername) {
  if (peerConnections.has(socketId)) return peerConnections.get(socketId);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const polite = String(me.id) > String(remoteUserId);
  const entry = {
    pc,
    polite,
    makingOffer: false,
    ignoreOffer: false,
    senders: { camera: [], mic: [], screen: [] },
    remoteUsername,
  };
  peerConnections.set(socketId, entry);

  pc.onnegotiationneeded = async () => {
    try {
      entry.makingOffer = true;
      await pc.setLocalDescription();
      socket.emit('signal', { to: socketId, data: { description: pc.localDescription } });
    } catch (err) {
      console.error('[webrtc] falha ao negociar:', err);
    } finally {
      entry.makingOffer = false;
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('signal', { to: socketId, data: { candidate } });
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    const username = entry.remoteUsername || peerInfoBySocket.get(socketId)?.username;
    const record = ensureRemoteTile(socketId, stream, username);
    if (record.video.srcObject !== stream) record.video.srcObject = stream;
    applyMetaToTile(socketId, stream.id);
    stream.addEventListener('removetrack', () => {
      if (stream.getTracks().length === 0) removeTile(socketId, stream.id);
    });
  };

  // Anexa as mídias locais já ativas a esta nova conexão.
  for (const kind of Object.keys(localStreams)) {
    const stream = localStreams[kind];
    if (!stream) continue;
    for (const track of stream.getTracks()) {
      entry.senders[kind].push(pc.addTrack(track, stream));
    }
  }

  return entry;
}

function closePeerConnection(socketId) {
  const entry = peerConnections.get(socketId);
  if (!entry) return;
  entry.pc.close();
  peerConnections.delete(socketId);
  removeTilesForSocket(socketId);
}

// ---------- Compartilhamento local ----------

function broadcastMeta(kind, streamId, active) {
  socket.emit('stream:meta', { kind, streamId, active, username: me.username });
}

function setLocalStream(kind, stream) {
  localStreams[kind] = stream;
  for (const entry of peerConnections.values()) {
    for (const track of stream.getTracks()) {
      entry.senders[kind].push(entry.pc.addTrack(track, stream));
    }
  }
  broadcastMeta(kind, stream.id, true);
  updateButtonState(kind, true);
}

function disableKind(kind) {
  const stream = localStreams[kind];
  if (!stream) return;
  for (const entry of peerConnections.values()) {
    for (const sender of entry.senders[kind]) {
      try { entry.pc.removeTrack(sender); } catch { /* já removido */ }
    }
    entry.senders[kind] = [];
  }
  broadcastMeta(kind, stream.id, false);
  stream.getTracks().forEach((t) => t.stop());
  localStreams[kind] = null;
  if (kind !== 'mic') removeLocalPreview(kind);
  updateButtonState(kind, false);
}

async function enableCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  setLocalStream('camera', stream);
  showLocalPreview('camera', stream);
}

async function enableMic() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  setLocalStream('mic', stream);
}

async function enableScreen(withAudio) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: withAudio });
  setLocalStream('screen', stream);
  showLocalPreview('screen', stream);
  stream.getVideoTracks()[0].addEventListener('ended', () => disableKind('screen'));
}

document.getElementById('toggle-camera').addEventListener('click', async () => {
  if (localStreams.camera) { disableKind('camera'); return; }
  try { await enableCamera(); } catch (err) { setStatus('Não foi possível acessar a câmera: ' + err.message); }
});

document.getElementById('toggle-mic').addEventListener('click', async () => {
  if (localStreams.mic) { disableKind('mic'); return; }
  try { await enableMic(); } catch (err) { setStatus('Não foi possível acessar o microfone: ' + err.message); }
});

document.getElementById('toggle-screen').addEventListener('click', async () => {
  if (localStreams.screen) { disableKind('screen'); return; }
  const withAudio = document.getElementById('screen-audio-checkbox').checked;
  try { await enableScreen(withAudio); } catch (err) { setStatus('Não foi possível compartilhar a tela: ' + err.message); }
});

document.getElementById('leave-room-btn').addEventListener('click', () => {
  window.location.href = '/dashboard.html';
});

window.addEventListener('beforeunload', () => {
  for (const stream of Object.values(localStreams)) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }
});

// ---------- Sinalização (Socket.IO) ----------

const socket = io({ auth: { token: Session.token } });

socket.on('connect_error', (err) => setStatus('Erro de conexão: ' + err.message));

socket.on('connect', () => {
  socket.emit('room:join', { roomId }, (ack) => {
    if (!ack || ack.error) {
      setStatus(ack ? ack.error : 'Falha ao entrar na sala.');
      return;
    }
    setStatus(`Conectado. ${ack.peers.length} outro(s) participante(s) na sala.`);
    for (const p of ack.peers) {
      peerInfoBySocket.set(p.socketId, { userId: p.userId, username: p.username });
      createPeerConnection(p.socketId, p.userId, p.username);
    }
  });
});

socket.on('room:peer-joined', (p) => {
  peerInfoBySocket.set(p.socketId, { userId: p.userId, username: p.username });
  createPeerConnection(p.socketId, p.userId, p.username);
  setStatus(`${p.username} entrou na sala.`);
});

socket.on('room:peer-left', ({ socketId }) => {
  const info = peerInfoBySocket.get(socketId);
  closePeerConnection(socketId);
  peerInfoBySocket.delete(socketId);
  if (info) setStatus(`${info.username} saiu da sala.`);
});

socket.on('stream:meta', ({ socketId, kind, streamId, active, username }) => {
  if (active === false) {
    remoteStreamMeta.delete(streamId);
    removeTile(socketId, streamId);
    return;
  }
  remoteStreamMeta.set(streamId, { kind, username: username || peerInfoBySocket.get(socketId)?.username });
  applyMetaToTile(socketId, streamId);
});

// Padrão de "perfect negotiation" (recomendado pela spec do WebRTC) para lidar
// com renegociações simultâneas quando várias pessoas ligam/desligam mídia ao
// mesmo tempo numa sala com várias conexões (malha).
socket.on('signal', async ({ from, data }) => {
  let entry = peerConnections.get(from);
  if (!entry) {
    const info = peerInfoBySocket.get(from);
    entry = createPeerConnection(from, info?.userId, info?.username);
  }
  const { pc } = entry;
  try {
    if (data.description) {
      const offerCollision = data.description.type === 'offer' &&
        (entry.makingOffer || pc.signalingState !== 'stable');
      entry.ignoreOffer = !entry.polite && offerCollision;
      if (entry.ignoreOffer) return;

      await pc.setRemoteDescription(data.description);
      if (data.description.type === 'offer') {
        await pc.setLocalDescription();
        socket.emit('signal', { to: from, data: { description: pc.localDescription } });
      }
    } else if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!entry.ignoreOffer) console.error('[webrtc] falha ao adicionar ICE candidate:', err);
      }
    }
  } catch (err) {
    console.error('[webrtc] erro ao processar sinal:', err);
  }
});

// ---------- Boot ----------

(async function main() {
  try {
    const { room } = await api(`/rooms/${roomId}`);
    document.getElementById('room-name').textContent = room.name;
  } catch (err) {
    alert('Não foi possível acessar esta sala: ' + err.message);
    window.location.href = '/dashboard.html';
  }
})();
