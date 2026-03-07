const socket = io();

let localStream = null;
let peer = null;
let room = null;

let pendingCandidates = [];

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const skipBtn = document.getElementById("skipBtn");


/* -----------------------------
START CAMERA IMMEDIATELY
----------------------------- */

async function initCamera() {

    if (localStream) return;

    try {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        console.log("Camera ready");

    } catch (err) {

        console.error("Camera error:", err);

    }

}

initCamera();



/* -----------------------------
CREATE PEER CONNECTION
----------------------------- */

function createPeer() {

    peer = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },

            {
                urls: "turn:free.expressturn.com:3478",
                username: "000000002088248567",
                credential: "oinC8j1907fZqIJ8N+18UOEXu6Q="
            }
        ]
    });

    localStream.getTracks().forEach(track => {
        peer.addTrack(track, localStream);
    });

    peer.ontrack = e => {

        console.log("Remote stream received");

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



/* -----------------------------
RESET PEER
----------------------------- */

function resetPeer() {

    if (peer) {

        peer.close();
        peer = null;

    }

    pendingCandidates = [];

    remoteVideo.srcObject = null;

}



/* -----------------------------
MATCH FOUND
----------------------------- */

socket.on("match_found", async data => {

    room = data.room;

    console.log("Matched in room:", room);

    if (!localStream) {
        await initCamera();
    }

    createPeer();

    if (data.initiator) {

        console.log("Creating offer");

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", {

            room: room,
            offer: offer

        });

    }

});



/* -----------------------------
RECEIVE OFFER
----------------------------- */

socket.on("offer", async data => {

    console.log("Received offer");

    if (!peer) createPeer();

    await peer.setRemoteDescription(data.offer);

    for (const candidate of pendingCandidates) {
        await peer.addIceCandidate(candidate);
    }

    pendingCandidates = [];

    const answer = await peer.createAnswer();

    await peer.setLocalDescription(answer);

    socket.emit("answer", {

        room: room,
        answer: answer

    });

});



/* -----------------------------
RECEIVE ANSWER
----------------------------- */

socket.on("answer", async data => {

    console.log("Received answer");

    await peer.setRemoteDescription(data.answer);

    // flush buffered ICE candidates
    for (const candidate of pendingCandidates) {
        await peer.addIceCandidate(candidate);
    }

    pendingCandidates = [];

});



/* -----------------------------
ICE CANDIDATES
----------------------------- */

socket.on("ice_candidate", async data => {

    if (!peer) return;

    if (peer.remoteDescription) {

        try {

            await peer.addIceCandidate(data.candidate);

        } catch (err) {

            console.error("ICE error:", err);

        }

    } else {

        pendingCandidates.push(data.candidate);

    }

});



/* -----------------------------
SKIP BUTTON
----------------------------- */

skipBtn.onclick = () => {

    console.log("Skipping");

    socket.emit("skip");

    resetPeer();
    room = null;

};



/* -----------------------------
PARTNER SKIPPED
----------------------------- */

socket.on("skip", () => {

    console.log("Partner skipped");

    resetPeer();
    room = null;

});