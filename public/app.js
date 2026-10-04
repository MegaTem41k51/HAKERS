const params = new URLSearchParams(location.search);
const sessionId = params.get("session");

const isOperator =
  location.pathname.includes("operator");

const wsProtocol =
  location.protocol === "https:" ? "wss:" : "ws:";

const socket = new WebSocket(
  `${wsProtocol}//${location.host}/?session=${sessionId}&role=${isOperator ? "operator" : "client"}`
);

let peer;
let localStream;

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

function send(message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function createPeer() {
  peer = new RTCPeerConnection(rtcConfig);

  peer.onicecandidate = event => {
    if (event.candidate) {
      send({
        type: "ice",
        candidate: event.candidate
      });
    }
  };

  peer.ontrack = event => {
    const remote = document.querySelector("#remote");

    if (remote) {
      remote.srcObject = event.streams[0];
    }
  };

  return peer;
}

socket.onopen = () => {
  const status = document.querySelector("#status");

  if (status) {
    status.textContent =
      isOperator
        ? "Ожидание пользователя..."
        : "Подключено к серверу.";
  }

  if (isOperator) {
    createPeer();
  }
};

socket.onmessage = async event => {
  const message = JSON.parse(event.data);

  if (message.type === "offer" && isOperator) {
    createPeer();

    await peer.setRemoteDescription(
      message.offer
    );

    const answer =
      await peer.createAnswer();

    await peer.setLocalDescription(answer);

    send({
      type: "answer",
      answer
    });
  }

  if (message.type === "answer" && !isOperator) {
    await peer.setRemoteDescription(
      message.answer
    );
  }

  if (message.type === "ice") {
    if (peer) {
      try {
        await peer.addIceCandidate(
          message.candidate
        );
      } catch {}
    }
  }

  if (message.type === "peer-disconnected") {
    const status = document.querySelector("#status");

    if (status) {
      status.textContent =
        "Пользователь отключился.";
    }
  }
};

async function startSharing(type) {
  if (isOperator) return;

  try {
    if (type === "camera") {
      localStream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
    }

    if (type === "screen") {
      localStream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
    }

    document.querySelector("#preview").srcObject =
      localStream;

    document.querySelector("#stop").hidden =
      false;

    peer = createPeer();

    for (const track of localStream.getTracks()) {
      peer.addTrack(track, localStream);
    }

    const offer = await peer.createOffer();

    await peer.setLocalDescription(offer);

    send({
      type: "offer",
      offer
    });

    localStream.getVideoTracks()[0].onended =
      stopSharing;

  } catch (error) {
    console.error(error);

    const status =
      document.querySelector("#status");

    if (status) {
      status.textContent =
        "Передача не была разрешена.";
    }
  }
}

function stopSharing() {
  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }

    localStream = null;
  }

  if (peer) {
    peer.close();
    peer = null;
  }

  const preview =
    document.querySelector("#preview");

  if (preview) {
    preview.srcObject = null;
  }

  const stop =
    document.querySelector("#stop");

  if (stop) {
    stop.hidden = true;
  }
}

const camera =
  document.querySelector("#camera");

const screen =
  document.querySelector("#screen");

const stop =
  document.querySelector("#stop");

if (camera) {
  camera.onclick =
    () => startSharing("camera");
}

if (screen) {
  screen.onclick =
    () => startSharing("screen");
}

if (stop) {
  stop.onclick = stopSharing;
}