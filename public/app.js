// public/app.js — стабильный клиент (compatible with server.js above)

// ---- DOM refs ----
const roomInput = document.getElementById('roomId');
const roleSelect = document.getElementById('roleSelect');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const statusSpan = document.getElementById('status');
const socketIdSpan = document.getElementById('socketId');
const showRoom = document.getElementById('showRoom');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const miniWrap = document.getElementById('miniWrap');

const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

// ---- state ----
let socket = null;
let pc = null;
let localStream = null;
let remoteStream = null;
let roomId = null;
let role = null;
let peerSocketId = null;

// ---- Xirsys ICE (static from your curl response) ----
const ICE_CONFIG = {
  iceServers: [
    {
      username: "B0UKGM_7iTKBEwxa1dB6bNj18YKk4Vm-Fo7a3ddF4G8gshE2GgC_0tLJnF8DGtPnAAAAAGjHzn1Qcm9kb29zc2Vy",
      credential: "24cbbacc-920e-11f0-82f1-e25abca605ee",
      urls: [
        "stun:fr-turn3.xirsys.com",
        "turn:fr-turn3.xirsys.com:80?transport=udp",
        "turn:fr-turn3.xirsys.com:3478?transport=udp",
        "turn:fr-turn3.xirsys.com:80?transport=tcp",
        "turn:fr-turn3.xirsys.com:3478?transport=tcp",
        "turns:fr-turn3.xirsys.com:443?transport=tcp",
        "turns:fr-turn3.xirsys.com:5349?transport=tcp"
      ]
    }
  ]
};

// ---- helpers ----
function setStatus(txt){ if(statusSpan) statusSpan.textContent = txt; }
function safeAddChat(user, text){ try { if (typeof window.addChat === 'function') { window.addChat(user, text); return; } } catch(e) {} // fallback
  const el = document.createElement('div'); el.textContent = user + ': ' + text; document.getElementById('chatArea').appendChild(el); }

// preferOpus — correct, safe reordering
function preferOpus(sdp) {
  if (!sdp) return sdp;
  const sdpLines = sdp.split("\r\n");
  const mLineIndex = sdpLines.findIndex(line => line.startsWith("m=audio"));
  if (mLineIndex === -1) return sdp;
  const opusLine = sdpLines.find(line => line.toLowerCase().includes("opus/48000"));
  if (!opusLine) return sdp;
  const opusPayload = opusLine.match(/:(\d+) opus\/48000/i)[1];
  const mParts = sdpLines[mLineIndex].split(" ");
  const header = mParts.slice(0,3);
  const rest = mParts.slice(3).filter(p => p !== opusPayload);
  sdpLines[mLineIndex] = [...header, opusPayload, ...rest].join(" ");
  return sdpLines.join("\r\n");
}

// ---- media & RTCPeerConnection ----
async function startLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 } },
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    localVideo.srcObject = localStream;
  } catch (e) {
    alert('Ошибка доступа к микрофону/камере: ' + (e.message || e));
    throw e;
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(ICE_CONFIG);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  // add local tracks (if ready)
  if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

  pc.ontrack = (evt) => {
    // attach remote stream (first stream)
    if (evt.streams && evt.streams[0]) {
      remoteStream.getTracks().forEach(t => t.stop());
      remoteStream = evt.streams[0];
      remoteVideo.srcObject = remoteStream;
    }
  };

  pc.onicecandidate = (evt) => {
    if (!evt.candidate) return;
    // if we know specific peer -> send directly; else broadcast to room
    if (peerSocketId) {
      socket.emit('ice-candidate', { to: peerSocketId, candidate: evt.candidate });
    } else if (roomId) {
      socket.emit('ice-candidate', { room: roomId, candidate: evt.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    setStatus(pc.connectionState);
    console.log('PC state', pc.connectionState);
  };
}

// ---- signalling handlers ----
function setupSocket() {
  socket = io();

  socket.on('connect', () => {
    if (socketIdSpan) socketIdSpan.textContent = socket.id;
    setStatus('connected to signalling');
    // emit join after connect
    socket.emit('join-room', roomId, role);
  });

  socket.on('peer-joined', (data) => {
    console.log('peer-joined', data);
    safeAddChat('system', `Peer joined: ${data.id} (${data.role})`);
    // if role teacher -> do an offer broadcast after short delay
    if (role === 'teacher') {
      setTimeout(async () => {
        try {
          if (!pc) createPeerConnection();
          const offer = await pc.createOffer();
          offer.sdp = preferOpus(offer.sdp);
          await pc.setLocalDescription(offer);
          // broadcast to room (server will relay to others)
          socket.emit('offer', { room: roomId, sdp: pc.localDescription });
          safeAddChat('system', 'Teacher: sent offer (broadcast)');
        } catch (e) {
          console.error('makeOffer error', e);
        }
      }, 400);
    }
  });

  socket.on('offer', async ({ from, sdp }) => {
    console.log('received offer from', from);
    safeAddChat('system', 'Received offer');
    peerSocketId = from;
    if (!pc) createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    answer.sdp = preferOpus(answer.sdp);
    await pc.setLocalDescription(answer);
    // send answer directly to sender
    socket.emit('answer', { to: from, sdp: pc.localDescription });
    safeAddChat('system', 'Sent answer to ' + from);
  });

  socket.on('answer', async ({ from, sdp }) => {
    console.log('received answer from', from);
    try {
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (e) { console.warn('setRemoteDescription(answer) failed', e); }
  });

  socket.on('ice-candidate', async ({ from, candidate }) => {
    try {
      if (pc) await pc.addIceCandidate(candidate);
    } catch (e) { console.warn('addIceCandidate failed', e); }
  });

  socket.on('peer-left', ({ id }) => {
    safeAddChat('system', `Peer left: ${id}`);
    // cleanup remote
    if (remoteVideo && remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(t => t.stop());
      remoteVideo.srcObject = null;
    }
    if (pc) { pc.close(); pc = null; }
  });

  socket.on('message', (payload) => {
    // payload.user, payload.text
    safeAddChat(payload.user, payload.text);
  });
}

// ---- UI actions ----
joinBtn.onclick = async () => {
  roomId = (roomInput && roomInput.value) ? roomInput.value.trim() : 'lesson123';
  role = (roleSelect && roleSelect.value) ? roleSelect.value : 'student';
  if (!roomId) return alert('Укажи Room ID');
  if (showRoom) showRoom.textContent = roomId;
  setStatus('connecting...');
  joinBtn.disabled = true;
  leaveBtn.disabled = false;

  try {
    await startLocalMedia();
    createPeerConnection();
    setupSocket();
  } catch (e) {
    console.error('join error', e);
    alert('Не удалось запустить локальные устройства: ' + (e.message || e));
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
  }
};

leaveBtn.onclick = () => {
  if (socket) socket.disconnect();
  if (pc) { pc.close(); pc = null; }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (remoteVideo) remoteVideo.srcObject = null;
  if (localVideo) localVideo.srcObject = null;
  setStatus('not connected');
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  safeAddChat('system', 'Left room');
};

// chat
sendChatBtn.onclick = () => {
  const text = (chatInput && chatInput.value) ? chatInput.value.trim() : '';
  if (!text) return;
  if (socket && roomId) {
    socket.emit('message', { room: roomId, user: role, text });
  }
  safeAddChat(role || 'me', text);
  if (chatInput) chatInput.value = '';
};

// basic swap: clicking mini swaps nodes (keeps srcObject references working)
document.getElementById('swapBtn')?.addEventListener('click', () => {
  const mainVid = document.querySelector('.video-box video'); // remote
  const miniVid = miniWrap.querySelector('video');
  if (!mainVid || !miniVid) return;
  // swap srcObject
  const a = mainVid.srcObject;
  const b = miniVid.srcObject;
  mainVid.srcObject = b;
  miniVid.srcObject = a;
});
