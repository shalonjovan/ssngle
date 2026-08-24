const socket = io();

let localStream = null;
let peer = null;
let room = null;
let mode = null;

let pendingCandidates = [];

const homeScreen = document.getElementById("home");
const videoScreen = document.getElementById("videoMode");
const textScreen = document.getElementById("textMode");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const startVideoBtn = document.getElementById("startVideo");
const startTextBtn = document.getElementById("startText");
const skipBtn = document.getElementById("skipBtn");
const textSkipBtn = document.getElementById("textSkipBtn");
const videoHomeBtn = document.getElementById("videoHomeBtn");
const textHomeBtn = document.getElementById("textHomeBtn");

const chatBtn = document.getElementById("chatBtn");
const chatPanel = document.getElementById("chatPanel");
const chatCloseBtn = document.getElementById("chatCloseBtn");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

const textMessages = document.getElementById("textMessages");
const textForm = document.getElementById("textForm");
const textInput = document.getElementById("textInput");
const textLabel = document.getElementById("textLabel");

const statusPill = document.getElementById("status-pill");
const onlineCount = document.getElementById("onlineCount");

/* -----------------------------
UI HELPERS
----------------------------- */

function setStatus(text, cls) {
    statusPill.textContent = text;
    statusPill.className = "status-pill " + cls;
}

function showToast(msg, duration = 2500) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), duration);
}

function showScreen(name) {
    homeScreen.style.display = name === "home" ? "flex" : "none";
    videoScreen.style.display = name === "video" ? "flex" : "none";
    textScreen.style.display = name === "text" ? "flex" : "none";
}

function chatContainer() {
    return mode === "video" ? chatMessages : textMessages;
}

/* -----------------------------
CAMERA
----------------------------- */

async function initCamera() {

    if (localStream) return;

    try {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;
        document.getElementById("local-placeholder").classList.add("hidden");

        console.log("Camera ready");

    } catch (err) {

        console.error("Camera error:", err);

    }

}

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

function addMessage(container, text, who) {

    const row = document.createElement("div");
    row.className = "chat-msg " + who;

    const label = document.createElement("span");
    label.className = "chat-label";
    label.textContent = who === "you" ? "You" : "Stranger";

    const body = document.createElement("p");
    body.textContent = text;

    row.appendChild(label);
    row.appendChild(body);

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;

}

function clearChat() {
    chatMessages.innerHTML = "";
    textMessages.innerHTML = "";
}

function sendChat(inputEl) {

    const text = inputEl.value.trim();

    if (!text || !room) return;

    socket.emit("chat_message", {
        room: room,
        text: text
    });

    addMessage(chatContainer(), text, "you");
    inputEl.value = "";

}

/* -----------------------------
SCREEN FLOW
----------------------------- */

function startMode(m) {

    mode = m;
    room = null;
    clearChat();

    if (m === "video") {

        showScreen("video");
        initCamera();
        setRemotePlaceholder(true, true, "Finding a stranger…");

    } else {

        showScreen("text");
        textLabel.textContent = "Finding a stranger…";

    }

    setStatus("SEARCHING…", "waiting");
    socket.emit("join", { mode: m });

}

function doLeave() {

    socket.emit("leave");

    resetPeer();
    room = null;
    mode = null;
    clearChat();

    showScreen("home");
    setStatus("IDLE", "idle");

}

function doSkip() {

    socket.emit("skip");

    resetPeer();
    room = null;
    clearChat();

    if (mode === "video") {
        setRemotePlaceholder(true, true, "Finding next stranger…");
    } else {
        textLabel.textContent = "Finding next stranger…";
    }

    setStatus("SEARCHING…", "waiting");

}

/* -----------------------------
PLACEHOLDERS
----------------------------- */

function setRemotePlaceholder(show, spinning = false, text = '') {
    const ph = document.getElementById("remote-placeholder");
    const sp = document.getElementById("remote-spinner");
    const lb = document.getElementById("remote-label");
    ph.classList.toggle("hidden", !show);
    sp.style.display = spinning ? "block" : "none";
    lb.textContent = text;
    remoteVideo.style.opacity = show ? "0" : "1";
}

/* -----------------------------
WIRE UP UI
----------------------------- */

startVideoBtn.onclick = () => startMode("video");
startTextBtn.onclick = () => startMode("text");

skipBtn.onclick = doSkip;
textSkipBtn.onclick = doSkip;
videoHomeBtn.onclick = doLeave;
textHomeBtn.onclick = doLeave;

chatBtn.onclick = () => chatPanel.classList.toggle("hidden");
chatCloseBtn.onclick = () => chatPanel.classList.add("hidden");
chatForm.onsubmit = e => {
    e.preventDefault();
    sendChat(chatInput);
};
textForm.onsubmit = e => {
    e.preventDefault();
    sendChat(textInput);
};

/* -----------------------------
SOCKET EVENTS
----------------------------- */

socket.on("online_count", data => {
    console.log("Online users:", data.count);
    onlineCount.textContent = `${data.count} online`;
});

socket.on("match_found", async data => {

    room = data.room;

    console.log("Matched in room:", room);

    if (mode === "video") {

        if (!localStream) await initCamera();

        await createPeer();

        setRemotePlaceholder(true, true, "Connecting video…");

        if (data.initiator) {

            console.log("Creating offer");

            const offer = await peer.createOffer();

            await peer.setLocalDescription(offer);

            socket.emit("offer", {
                room: room,
                offer: offer
            });

        }

    } else {

        textLabel.textContent = "Connected — say hi!";
        textInput.focus();

    }

    setStatus("CONNECTED", "chatting");
    showToast("Stranger found!");

});

socket.on("offer", async data => {

    if (mode !== "video" || !peer) return;

    console.log("Received offer");

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

socket.on("answer", async data => {

    if (mode !== "video" || !peer) return;

    console.log("Received answer");

    await peer.setRemoteDescription(data.answer);

    for (const candidate of pendingCandidates) {
        await peer.addIceCandidate(candidate);
    }

    pendingCandidates = [];

});

socket.on("ice_candidate", async data => {

    if (mode !== "video" || !peer) return;

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

socket.on("chat_message", data => {
    addMessage(chatContainer(), data.text, "stranger");
});

socket.on("skip", () => {

    console.log("Partner skipped");

    resetPeer();
    room = null;
    clearChat();

    if (mode === "video") {
        setRemotePlaceholder(true, true, "Finding next stranger…");
    } else {
        textLabel.textContent = "Finding next stranger…";
    }

    setStatus("SEARCHING…", "waiting");
    showToast("Stranger disconnected");

});

remoteVideo.addEventListener("playing", () => {
    setRemotePlaceholder(false);
    setStatus("CONNECTED", "chatting");
});

localVideo.addEventListener("playing", () => {
    document.getElementById("local-placeholder").classList.add("hidden");
});

/* -----------------------------
INIT
----------------------------- */

showScreen("home");
setStatus("IDLE", "idle");
