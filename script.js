const socket = io();

let localStream;
let peer;
let room;

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const skipBtn = document.getElementById("skipBtn");

async function startCamera() {

    if (!localStream) {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;
    }

}

function createPeer() {

    peer = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    });

    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    peer.ontrack = e => {
        remoteVideo.srcObject = e.streams[0];
    };

    peer.onicecandidate = e => {

        if (e.candidate) {

            socket.emit("ice_candidate", {
                room: room,
                candidate: e.candidate
            });

        }

    };

}


socket.on("match_found", async data => {

    room = data.room;

    console.log("Matched in room:", room);

    await startCamera();

    createPeer();

    if (data.initiator) {

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", {
            room: room,
            offer: offer
        });

    }

});


socket.on("offer", async data => {

    await peer.setRemoteDescription(data.offer);

    const answer = await peer.createAnswer();

    await peer.setLocalDescription(answer);

    socket.emit("answer", {
        room: room,
        answer: answer
    });

});


socket.on("answer", async data => {

    await peer.setRemoteDescription(data.answer);

});


socket.on("ice_candidate", async data => {

    if (peer) {
        await peer.addIceCandidate(data.candidate);
    }

});


skipBtn.onclick = () => {

    socket.emit("skip");

    if (peer) {
        peer.close();
        peer = null;
    }

    remoteVideo.srcObject = null;

};


socket.on("skip", () => {

    if (peer) {
        peer.close();
        peer = null;
    }

    remoteVideo.srcObject = null;

});