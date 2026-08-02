const socket = io();

let localStream = null;
let peer = null;
let room = null;

let pendingCandidates = [];

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const skipBtn = document.getElementById("skipBtn");

const chatBtn = document.getElementById("chatBtn");
const chatPanel = document.getElementById("chatPanel");
const chatCloseBtn = document.getElementById("chatCloseBtn");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

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

let ICE_CONFIG = null;

async function loadIceServers() {

    if (ICE_CONFIG) return ICE_CONFIG;

    const res = await fetch("/api/ice");

    ICE_CONFIG = await res.json();
    console.log("Loaded ICE servers:", ICE_CONFIG);

    return ICE_CONFIG;
}

async function createPeer() {

    const iceConfig = await loadIceServers();

    peer = new RTCPeerConnection(iceConfig);

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
CHAT
----------------------------- */

function appendChat(text, who) {

    const row = document.createElement("div");
    row.className = "chat-msg " + who;

    const label = document.createElement("span");
    label.className = "chat-label";
    label.textContent = who === "you" ? "You" : "Stranger";

    const body = document.createElement("p");
    body.textContent = text;

    row.appendChild(label);
    row.appendChild(body);

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

}

function clearChat() {
    chatMessages.innerHTML = "";
}

function sendChat() {

    const text = chatInput.value.trim();

    if (!text || !room) return;

    socket.emit("chat_message", {
        room: room,
        text: text
    });

    appendChat(text, "you");
    chatInput.value = "";

}

function toggleChat() {
    chatPanel.classList.toggle("hidden");
}

chatBtn.onclick = toggleChat;

chatCloseBtn.onclick = () => chatPanel.classList.add("hidden");

chatForm.onsubmit = e => {
    e.preventDefault();
    sendChat();
};

socket.on("chat_message", data => {
    appendChat(data.text, "stranger");
});

// /* -----------------------------
// ONLINE COUNT
// ----------------------------- */

// socket.on("online_count", data => {

//     console.log("Online users:", data.count);
//     onlineCount.textContent = `${data.count} online`;

// });


/* -----------------------------
MATCH FOUND
----------------------------- */

socket.on("match_found", async data => {

    room = data.room;

    console.log("Matched in room:", room);

    if (!localStream) {
        await initCamera();
    }

    await createPeer();

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
    clearChat();

};



/* -----------------------------
PARTNER SKIPPED
----------------------------- */

socket.on("skip", () => {

    console.log("Partner skipped");

    resetPeer();
    room = null;
    clearChat();

});