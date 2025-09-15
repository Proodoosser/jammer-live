// public/app.js

const statusEl = document.getElementById("status");
const chatEl = document.getElementById("chatArea");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const joinTeacherBtn = document.getElementById("joinTeacher");
const joinStudentBtn = document.getElementById("joinStudent");
const leaveBtn = document.getElementById("leaveBtn");

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
  if (window.addChat) {
    window.addChat(user, text);
  } else {
    // fallback
    const div = document.createElement("div");
    div.textContent = `${user}: ${text}`;
    chatEl.appendChild(div);
  }
}

// ========== media ==========
async function getMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
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
  } catch (err) {
    console.error("getUserMedia failed:", err);
    alert("Ошибка доступа к камере/микрофону");
  }
}

// ========== WebRTC ==========
function createPeerConnection() {
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

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("candidate", { candidate: e.candidate, to: peerSocketId });
    }
  };

  pc.ontrack = (e) => {
    if (remoteVideo.srcObject !== e.streams[0]) {
      remoteVideo.srcObject = e.streams[0];
    }
  };

  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
}

async function makeOffer() {
  try {
    const offer = await pc.createOffer();
    const sdp = preferOpus(offer.sdp);
    await pc.setLocalDescription({ type: "offer", sdp });
    socket.emit("offer", { sdp, to: peerSocketId });
  } catch (err) {
    console.error("makeOffer error:", err);
  }
}

async function handleOffer(msg) {
  peerSocketId = msg.from;
  await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
  const answer = await pc.createAnswer();
  const sdp = preferOpus(answer.sdp);
  await pc.setLocalDescription({ type: "answer", sdp });
  socket.emit("answer", { sdp, to: peerSocketId });
}

async function handleAnswer(msg) {
  await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
}

async function handleCandidate(msg) {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  } catch (err) {
    console.error("Error adding candidate:", err);
  }
}

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

// ========== socket ==========
function setupSocket() {
  socket = io();

  socket.on("connect", () => {
    setStatus(`Connected as ${role}`);
    socket.emit("join", { role });
  });

  socket.on("chat", (msg) => {
    addChat(msg.user, msg.text);
  });

  socket.on("peer", async (msg) => {
    peerSocketId = msg.id;
    createPeerConnection();
    if (role === "teacher") {
      await makeOffer();
    }
  });

  socket.on("offer", handleOffer);
  socket.on("answer", handleAnswer);
  socket.on("candidate", handleCandidate);
}

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

joinTeacherBtn.onclick = () => joinAs("teacher");
joinStudentBtn.onclick = () => joinAs("student");

leaveBtn.onclick = () => {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (socket) socket.disconnect();
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  setStatus("Disconnected");
  joinTeacherBtn.disabled = false;
  joinStudentBtn.disabled = false;
  leaveBtn.disabled = true;
};

sendChatBtn.onclick = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat", { text });
  addChat("Me", text);
  chatInput.value = "";
};
