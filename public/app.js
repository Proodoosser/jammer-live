const socket = io();

// 🔹 Получаем локальный медиа-стрим
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let pc;

// 🔹 ICE сервера Xirsys (ты получил curl)
const iceServers = [
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
];

// 🔹 Создание PeerConnection
async function createPeerConnection() {
  pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { room: "lesson1", candidate: event.candidate });
    }
  };

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
  localVideo.srcObject = stream;
}

// 🔹 Обработка сигналинга
socket.emit("join-room", "lesson1", "student");

socket.on("peer-joined", async ({ id }) => {
  console.log("Peer joined:", id);
  await createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("offer", { room: "lesson1", sdp: offer });
});

socket.on("offer", async ({ from, sdp }) => {
  await createPeerConnection();
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { room: "lesson1", sdp: answer });
});

socket.on("answer", async ({ sdp }) => {
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ candidate }) => {
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error("Error adding received ICE candidate", e);
  }
});
