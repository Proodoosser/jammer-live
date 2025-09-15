const socket = io();

let pc;
let localStream;
let role = null;
let roomId = null;

const config = {
  iceServers: [
    {
      urls: "turns:global.xirsys.net:5349",
      username: "Prodoosser",
      credential: "c673ce8e-920c-11f0-8f21-4662eff0c0a9"
    }
  ],
  iceTransportPolicy: "relay"
};

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    document.getElementById("localVideo").srcObject = localStream;
  } catch (e) {
    console.error("getUserMedia error", e);
  }
}

function createPeerConnection() {
  pc = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    console.log("ontrack", event.streams);
    if (event.streams && event.streams[0]) {
      document.getElementById("remoteVideo").srcObject = event.streams[0];
    } else {
      let inbound = new MediaStream();
      inbound.addTrack(event.track);
      document.getElementById("remoteVideo").srcObject = inbound;
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: event.candidate });
    }
  };
}

async function joinAs(r) {
  role = r;
  roomId = document.getElementById("roomId").value;
  document.getElementById("status").textContent = "connecting...";

  await initMedia();
  createPeerConnection();

  socket.emit("join", { roomId, role });
}

socket.on("offer", async ({ sdp }) => {
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { roomId, sdp: pc.localDescription });
});

socket.on("answer", async ({ sdp }) => {
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ candidate }) => {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error("Error adding candidate", e);
  }
});

socket.on("chat", ({ user, text }) => {
  addChat(user, text);
});

function addChat(user, text) {
  const div = document.createElement("div");
  div.className = "msg " + (user || "system");
  div.textContent = `${user}: ${text}`;
  document.getElementById("chatArea").appendChild(div);
  document.getElementById("chatArea").scrollTop = 9999;
}

// UI
document.getElementById("joinBtn").onclick = () => joinAs(document.getElementById("roleSelect").value);
document.getElementById("leaveBtn").onclick = () => location.reload();
document.getElementById("sendBtn").onclick = () => {
  const val = document.getElementById("chatMsg").value.trim();
  if (!val) return;
  socket.emit("chat", { roomId, user: role, text: val });
  document.getElementById("chatMsg").value = "";
};
