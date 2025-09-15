/* ======= Конфигурация ======= */
const SIGNALING_SERVER =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : window.location.origin;

// Xirsys ICE (лучше обновлять динамически, пока — статический)
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
      username:
        "B0UKGM_7iTKBEwxa1dB6bNj18YKk4Vm-Fo7a3ddF4G8gshE2GgC_0tLJnF8DGtPnAAAAAGjHzn1Qcm9kb29zc2Vy",
      credential: "24cbbacc-920e-11f0-82f1-e25abca605ee",
    },
  ],
};
// public/app.js

/* ======= Элементы ======= */
const statusEl = document.getElementById("status");
const chatEl = document.getElementById("chatArea");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const joinBtn = document.getElementById("joinBtn");
const joinTeacherBtn = document.getElementById("joinTeacher");
const joinStudentBtn = document.getElementById("joinStudent");
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
let socket;
let pc;
let localStream;
let role;
let peerSocketId;

// ========== helpers ==========
function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function addChat(user, text) {
  const d = document.createElement("div");
  d.className = "msg";
  d.innerHTML = `<b>${user}:</b> ${text}`;
  chatEl.appendChild(d);
  chatEl.scrollTop = chatEl.scrollHeight;
  if (window.addChat) {
    window.addChat(user, text);
  } else {
    // fallback
    const div = document.createElement("div");
    div.textContent = `${user}: ${text}`;
    chatEl.appendChild(div);
  }
}

/* ======= WebRTC ======= */
async function startLocalMedia() {
// ========== media ==========
async function getMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
    });
    localVideo.srcObject = localStream;
  } catch (e) {
    alert("Ошибка доступа к камере/микрофону: " + e.message);
    throw e;
  } catch (err) {
    console.error("getUserMedia failed:", err);
    alert("Ошибка доступа к камере/микрофону");
  }
}

// ========== WebRTC ==========
function createPeerConnection() {
  pc = new RTCPeerConnection(ICE_CONFIG);

  if (localStream) {
    localStream.getTracks().forEach((track) =>
      pc.addTrack(track, localStream)
    );
  }
  pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
        ],
      },
    ],
    iceTransportPolicy: "relay",
  });

  pc.ontrack = (evt) => {
    log("Got remote stream");
    remoteVideo.srcObject = evt.streams[0];
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("candidate", { candidate: e.candidate, to: peerSocketId });
    }
  };

  pc.onicecandidate = (evt) => {
    if (evt.candidate && peerSocketId) {
      socket.emit("ice-candidate", { to: peerSocketId, candidate: evt.candidate });
      log("Sent ICE candidate to " + peerSocketId);
  pc.ontrack = (e) => {
    if (remoteVideo.srcObject !== e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
    }
  };

  pc.onconnectionstatechange = () => {
    statusSpan.textContent = pc.connectionState;
    log("PC state: " + pc.connectionState);
  };
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}

async function makeOffer() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer", { to: peerSocketId, sdp: pc.localDescription });
  log("Sent offer to " + peerSocketId);
  try {
    const offer = await pc.createOffer();
    const sdp = preferOpus(offer.sdp);
    await pc.setLocalDescription({ type: "offer", sdp });
    socket.emit("offer", { sdp, to: peerSocketId });
  } catch (err) {
    console.error("makeOffer error:", err);
  }
}

/* ======= Socket ======= */
function setupSocket() {
  socket = io(SIGNALING_SERVER);
async function handleOffer(msg) {
  peerSocketId = msg.from;
  await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
  const answer = await pc.createAnswer();
  const sdp = preferOpus(answer.sdp);
  await pc.setLocalDescription({ type: "answer", sdp });
  socket.emit("answer", { sdp, to: peerSocketId });
}

  socket.on("connect", () => {
    socketIdSpan.textContent = socket.id;
    log("Connected to signaling server: " + socket.id);
    socket.emit("join-room", roomId, role);
  });
async function handleAnswer(msg) {
  await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
}

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
async function handleCandidate(msg) {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  } catch (err) {
    console.error("Error adding candidate:", err);
  }
}

  socket.on("offer", async ({ from, sdp }) => {
    if (role === "student") {
      log("Received offer from " + from);
      peerSocketId = from;
      if (!pc) createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { to: from, sdp: pc.localDescription });
      log("Sent answer to " + from);
    }
  });
// ========== prefer Opus ==========
function preferOpus(sdp) {
  if (!sdp) return sdp;
  const sdpLines = sdp.split("\r\n");
  const mLineIndex = sdpLines.findIndex((l) => l.startsWith("m=audio"));
  if (mLineIndex === -1) return sdp;
  const opusPayload = sdpLines
    .find((l) => l.toLowerCase().includes("opus/48000"))
    ?.match(/:(\d+)/)?.[1];
  if (!opusPayload) return sdp;
  const mLineParts = sdpLines[mLineIndex].split(" ");
  const first = mLineParts.slice(0, 3);
  const rest = mLineParts.slice(3).filter((p) => p !== opusPayload);
  sdpLines[mLineIndex] = [...first, opusPayload, ...rest].join(" ");
  return sdpLines.join("\r\n");
}

  socket.on("answer", async ({ from, sdp }) => {
    log("Received answer from " + from);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
// ========== socket ==========
function setupSocket() {
  socket = io();

  socket.on("connect", () => {
    setStatus(`Connected as ${role}`);
    socket.emit("join", { role });
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
  socket.on("chat", (msg) => {
    addChat(msg.user, msg.text);
  });

  socket.on("peer-left", ({ id }) => {
    log("Peer left: " + id);
    addChat("system", "Партнёр отключился");
    if (pc) {
      pc.close();
      pc = null;
  socket.on("peer", async (msg) => {
    peerSocketId = msg.id;
    createPeerConnection();
    if (role === "teacher") {
      await makeOffer();
    }
    remoteVideo.srcObject = null;
  });

  socket.on("message", ({ user, text }) => {
    addChat(user, text);
  });
  socket.on("offer", handleOffer);
  socket.on("answer", handleAnswer);
  socket.on("candidate", handleCandidate);
}

/* ======= Join / Leave ======= */
joinBtn.onclick = async () => {
  roomId = roomIdInput.value.trim();
  role = roleSelect.value;
  if (!roomId) return alert("Укажи Room ID");

  showRoom.textContent = roomId;
  statusSpan.textContent = "connecting...";
  joinBtn.disabled = true;
  leaveBtn.disabled = false;
// ========== UI ==========
function joinAs(r) {
  role = r;
  getMedia().then(() => {
    setupSocket();
    joinTeacherBtn.disabled = true;
    joinStudentBtn.disabled = true;
    leaveBtn.disabled = false;
  });
}

  await startLocalMedia();
  createPeerConnection();
  setupSocket();
};
joinTeacherBtn.onclick = () => joinAs("teacher");
joinStudentBtn.onclick = () => joinAs("student");

leaveBtn.onclick = () => {
  if (socket) socket.disconnect();
  if (pc) {
    pc.close();
    pc = null;
  }
  if (socket) socket.disconnect();
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  joinBtn.disabled = false;
  remoteVideo.srcObject = null;
  setStatus("Disconnected");
  joinTeacherBtn.disabled = false;
  joinStudentBtn.disabled = false;
  leaveBtn.disabled = true;
  statusSpan.textContent = "not connected";
  log("Left room");
};

/* ===== Chat ===== */
sendChatBtn.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  if (socket) socket.emit("message", { room: roomId, user: role, text });
  socket.emit("chat", { text });
  addChat("Me", text);
  chatInput.value = "";
};
