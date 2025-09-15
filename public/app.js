/* ======= Конфигурация ======= */
const SIGNALING_SERVER =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : window.location.origin;

// ICE config (relay-only через Xirsys)
const ICE_CONFIG = {
  iceTransportPolicy: "relay",
  iceServers: [
    {
      urls: [
        "stun:fr-turn3.xirsys.com",
        "turn:fr-turn3.xirsys.com:80?transport=udp",
        "turn:fr-turn3.xirsys.com:3478?transport=udp",
        "turn:fr-turn3.xirsys.com:80?transport=tcp",
        "turn:fr-turn3.xirsys.com:3478?transport=tcp",
        "turns:fr-turn3.xirsys.com:443?transport=tcp",
        "turns:fr-turn3.xirsys.com:5349?transport=tcp",
      ],
      username:
        "B0UKGM_7iTKBEwxa1dB6bNj18YKk4Vm-Fo7a3ddF4G8gshE2GgC_0tLJnF8DGtPnAAAAAGjHzn1Qcm9kb29zc2Vy",
      credential: "24cbbacc-920e-11f0-82f1-e25abca605ee",
    },
  ],
};

/* ======= Элементы ======= */
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const joinBtn = document.getElementById("joinBtn");
const leaveBtn = document.getElementById("leaveBtn");
const roomIdInput = document.getElementById("roomId");
const roleSelect = document.getElementById("roleSelect");
const statusSpan = document.getElementById("status");
const showRoom = document.getElementById("showRoom");
const socketIdSpan = document.getElementById("socketId");
const logEl = document.getElementById("log");
const chatEl = document.getElementById("chat");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

let socket = null;
let pc = null;
let localStream = null;
let roomId = null;
let role = null;
let peerSocketId = null;

/* ======= Утилиты ======= */
function log(msg) {
  const d = document.createElement("div");
  d.textContent = msg;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}
function addChat(user, text) {
  const d = document.createElement("div");
  d.className = "msg";
  d.innerHTML = `<b>${user}:</b> ${text}`;
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
}

/* ======= WebRTC ======= */
async function startLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    localVideo.srcObject = localStream;
  } catch (e) {
    alert("Ошибка доступа к камере/микрофону: " + e.message);
    throw e;
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(ICE_CONFIG);

  if (localStream) {
    localStream.getTracks().forEach((track) =>
      pc.addTrack(track, localStream)
    );
  }

  pc.ontrack = (evt) => {
    log("Got remote stream");
    remoteVideo.srcObject = evt.streams[0];
  };

  pc.onicecandidate = (evt) => {
    if (evt.candidate && peerSocketId) {
      socket.emit("ice-candidate", { to: peerSocketId, candidate: evt.candidate });
      log("Sent ICE candidate to " + peerSocketId);
    }
  };

  pc.onconnectionstatechange = () => {
    statusSpan.textContent = pc.connectionState;
    log("PC state: " + pc.connectionState);
  };
}

async function makeOffer() {
  const offer = await pc.createOffer();
  // 🟢 приоритет Opus
  if (offer.sdp) {
    offer.sdp = offer.sdp.replace(
      /(m=audio .*RTP\/SAVPF )([0-9 ]+)/,
      (match, prefix, codecs) => {
        const opus = codecs.split(" ").find((c) => {
          return offer.sdp.includes(`a=rtpmap:${c} opus/48000`);
        });
        return opus ? `${prefix}${opus} ${codecs.replace(opus, "").trim()}` : match;
      }
    );
  }
  await pc.setLocalDescription(offer);
  socket.emit("offer", { to: peerSocketId, sdp: pc.localDescription });
  log("Sent offer to " + peerSocketId);
}

/* ======= Socket ======= */
function setupSocket() {
  socket = io(SIGNALING_SERVER);

  socket.on("connect", () => {
    socketIdSpan.textContent = socket.id;
    log("Connected to signaling server: " + socket.id);
    socket.emit("join-room", roomId, role);
  });

  socket.on("peer-joined", ({ id, role: r }) => {
    log("Peer joined: " + JSON.stringify({ id, role: r }));
    // Только teacher ↔ student
    if (role !== r) {
      peerSocketId = id;
      if (role === "teacher") {
        makeOffer();
      }
    }
  });

  socket.on("offer", async ({ from, sdp }) => {
    if (role === "student") {
      log("Received offer from " + from);
      peerSocketId = from;
      if (!pc) createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      if (answer.sdp) {
        answer.sdp = answer.sdp.replace(
          /(m=audio .*RTP\/SAVPF )([0-9 ]+)/,
          (match, prefix, codecs) => {
            const opus = codecs.split(" ").find((c) => {
              return answer.sdp.includes(`a=rtpmap:${c} opus/48000`);
            });
            return opus ? `${prefix}${opus} ${codecs.replace(opus, "").trim()}` : match;
          }
        );
      }
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, sdp: pc.localDescription });
      log("Sent answer to " + from);
    }
  });

  socket.on("answer", async ({ from, sdp }) => {
    log("Received answer from " + from);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  });

  socket.on("ice-candidate", async ({ from, candidate }) => {
    if (pc) {
      try {
        await pc.addIceCandidate(candidate);
        log("Added ICE candidate from " + from);
      } catch (e) {
        console.warn("Error adding candidate", e);
      }
    }
  });

  socket.on("peer-left", ({ id }) => {
    log("Peer left: " + id);
    addChat("system", "Партнёр отключился");
    if (pc) {
      pc.close();
      pc = null;
    }
    remoteVideo.srcObject = null;
  });

  socket.on("message", ({ user, text }) => {
    addChat(user, text);
  });
}

/* ===== Chat ===== */
sendChatBtn.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  if (socket) socket.emit("message", { room: roomId, user: role, text });
  chatInput.value = "";
};

/* ===== Обратная совместимость (HTML) ===== */
async function joinAs(r) {
  role = r;
  roomId = roomIdInput.value.trim();
  if (!roomId) {
    alert("Укажи Room ID");
    return;
  }

  showRoom.textContent = roomId;
  statusSpan.textContent = "connecting...";
  joinBtn.disabled = true;
  leaveBtn.disabled = false;

  try {
    await startLocalMedia();
    createPeerConnection();
    setupSocket();
  } catch (err) {
    console.error("Ошибка при joinAs:", err);
    alert("Не удалось подключиться: " + err.message);
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    statusSpan.textContent = "not connected";
  }
}

function leaveRoom() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;

  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  statusSpan.textContent = "not connected";
  log("Left room");
}
