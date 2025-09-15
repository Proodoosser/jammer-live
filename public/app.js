/* ======= Конфигурация ======= */
const SIGNALING_SERVER =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : window.location.origin;

const ICE_CONFIG = {
  iceServers: [
    {
      urls: [
        "stun:fr-turn3.xirsys.com",
        "turn:fr-turn3.xirsys.com:80?transport=udp",
        "turn:fr-turn3.xirsys.com:3478?transport=udp",
        "turn:fr-turn3.xirsys.com:80?transport=tcp",
        "turn:fr-turn3.xirsys.com:3478?transport=tcp",
        "turns:fr-turn3.xirsys.com:443?transport=tcp",
        "turns:fr-turn3.xirsys.com:5349?transport=tcp"
      ],
      username: "B0UKGM_7iTKBEwxa1dB6bNj18YKk4Vm-Fo7a3ddF4G8gshE2GgC_0tLJnF8DGtPnAAAAAGjHzn1Qcm9kb29zc2Vy",
      credential: "24cbbacc-920e-11f0-82f1-e25abca605ee"
    }
  ]
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
let remoteStream = null;
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

/* ======= WebRTC & Socket ======= */
async function startLocalMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch (e) {
    alert("Ошибка доступа к камере/микрофону: " + e.message);
    throw e;
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(ICE_CONFIG);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  if (localStream) {
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  }

  pc.ontrack = (evt) => {
    evt.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
  };

  pc.onicecandidate = (evt) => {
    if (evt.candidate && peerSocketId) {
      socket.emit("ice-candidate", { to: peerSocketId, candidate: evt.candidate });
      log("Sent ICE candidate to " + peerSocketId);
    }
  };

  pc.onconnectionstatechange = () => {
    log("PC state: " + pc.connectionState);
    statusSpan.textContent = pc.connectionState;
  };
}

/* ===== Socket.IO ===== */
function setupSocket() {
  socket = io(SIGNALING_SERVER);

  socket.on("connect", () => {
    socketIdSpan.textContent = socket.id;
    log("Connected to signaling server: " + socket.id);
  });

  socket.on("peer-joined", (data) => {
    log("Peer joined: " + JSON.stringify(data));
    peerSocketId = data.id;
  });

  socket.on("offer", async ({ from, sdp }) => {
    log("Received offer from " + from);
    peerSocketId = from;
    if (!pc) createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { to: from, sdp: pc.localDescription });
    log("Sent answer to " + from);
  });

  socket.on("answer", async ({ from, sdp }) => {
    log("Received answer from " + from);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  });

  socket.on("ice-candidate", async ({ from, candidate }) => {
    log("Received ICE from " + from);
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      console.warn(e);
    }
  });

  socket.on("peer-left", ({ id }) => {
    log("Peer left: " + id);
    addChat("system", "Партнёр отключился");
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => t.stop());
      remoteStream = null;
      remoteVideo.srcObject = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
  });

  socket.on("message", ({ user, text }) => {
    addChat(user, text);
  });
}

/* ======= Join ======= */
joinBtn.onclick = async () => {
  roomId = roomIdInput.value.trim();
  role = roleSelect.value;
  if (!roomId) return alert("Укажи Room ID");

  showRoom.textContent = roomId;
  statusSpan.textContent = "connecting...";
  joinBtn.disabled = true;
  leaveBtn.disabled = false;

  setupSocket();
  await startLocalMedia();
  createPeerConnection();

  socket.emit("join-room", roomId, role);
  log("Joined room " + roomId + " as " + role);

  socket.on("connect", async () => {
    setTimeout(async () => {
      if (role === "teacher") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { to: null, sdp: pc.localDescription, room: roomId });
        log("Teacher: created offer and emitted (broadcast)");
      }
    }, 500);
  });
};

/* ====== Leave ====== */
leaveBtn.onclick = () => {
  if (socket) socket.disconnect();
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
};

/* ===== Chat ====== */
sendChatBtn.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  addChat(role, text);
  if (socket) socket.emit("message", { room: roomId, user: role, text });
  chatInput.value = "";
};
