let localStream;
let peer;

async function startCamera() {

    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    document.getElementById("localVideo").srcObject = localStream;

    peer = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    });

    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    peer.ontrack = (event) => {
        document.getElementById("remoteVideo").srcObject = event.streams[0];
    };

    peer.onicecandidate = (event) => {
        if (event.candidate === null) {
            document.getElementById("signalData").value =
                JSON.stringify(peer.localDescription);
        }
    };
}

async function createOffer() {

    await startCamera();

    const offer = await peer.createOffer();

    await peer.setLocalDescription(offer);
}

async function createAnswer() {

    await startCamera();

    const offer = JSON.parse(document.getElementById("signalData").value);

    await peer.setRemoteDescription(offer);

    const answer = await peer.createAnswer();

    await peer.setLocalDescription(answer);
}

async function acceptAnswer() {

    const answer = JSON.parse(document.getElementById("signalData").value);

    await peer.setRemoteDescription(answer);
}

window.acceptAnswer = acceptAnswer;
window.createOffer = createOffer;
window.createAnswer = createAnswer;