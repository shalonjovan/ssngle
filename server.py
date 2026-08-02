import uuid
import time
from fastapi import FastAPI
import socketio
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv

load_dotenv()

TURN_USER = os.getenv("TURN_USER")
TURN_PASS = os.getenv("TURN_PASS")
TURN_URL = os.getenv("TURN_URL")

connected_users = set()

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

socket_app = socketio.ASGIApp(sio, app)

queue = []
rooms = {}
user_modes = {}

cooldowns = {}

COOLDOWN_TIME = 3


@app.get("/")
def index():
    return FileResponse("index.html")

@app.get("/ping")
@app.head("/ping")
def ping():
    return {"status": "alive"}

@app.get("/api/ice")
async def get_ice_servers():
    print("\nICE servers requested")

    ice_servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun2.l.google.com:19302"},
    ]

    if TURN_URL and TURN_USER and TURN_PASS:
        ice_servers.append({
            "urls": TURN_URL,
            "username": TURN_USER,
            "credential": TURN_PASS
        })
    print("Returning ICE servers:", ice_servers)
    return JSONResponse({"iceServers": ice_servers})
# -------------------------
# CONNECT
# -------------------------

@sio.event
async def connect(sid, environ):

    ip = environ.get("REMOTE_ADDR")

    print("\n===================")
    print("User connected")
    print("SID:", sid)
    print("IP:", ip)

    connected_users.add(sid)
    print("\nConnected users:", len(connected_users))
    await sio.emit("online_count", {"count": len(connected_users)})


# -------------------------
# JOIN (choose video / text mode)
# -------------------------

@sio.event
async def join(sid, data):

    mode = (data or {}).get("mode", "video")

    if mode not in ("video", "text"):
        mode = "video"

    if any(sid in users for users in rooms.values()):
        return

    user_modes[sid] = mode

    if sid not in queue:
        queue.append(sid)

    print(f"User {sid} joined queue as {mode} mode")
    print("Queue:", queue)

    await try_match()


# -------------------------
# LEAVE (go back to landing page)
# -------------------------

@sio.event
async def leave(sid):

    if sid in queue:
        queue.remove(sid)

    for room_id, users in list(rooms.items()):

        if sid in users:

            users.remove(sid)

            if users:
                other = users[0]
                if other not in queue:
                    queue.append(other)

            del rooms[room_id]

            await sio.emit("skip", room=room_id, skip_sid=sid)
            break

    user_modes.pop(sid, None)

    print("User left:", sid)
    print("Queue:", queue)

    await try_match()


# -------------------------
# DISCONNECT
# -------------------------

@sio.event
async def disconnect(sid):

    print("\nUser disconnected:", sid)

    connected_users.discard(sid)
    print("Total online:", len(connected_users))
    await sio.emit("online_count", {"count": len(connected_users)})

    if sid in queue:
        queue.remove(sid)

    for room_id, users in list(rooms.items()):

        if sid in users:

            print("User left room:", room_id)

            users.remove(sid)

            if users:
                other = users[0]
                print("Requeue remaining user:", other)
                if other not in queue:
                    queue.append(other)

            del rooms[room_id]
            break

    user_modes.pop(sid, None)

    print("Queue:", queue)
    print("Rooms:", rooms)

    await try_match()


# -------------------------
# SKIP
# -------------------------

@sio.event
async def skip(sid):

    print("\nSkip requested by:", sid)

    for room_id, users in list(rooms.items()):

        if sid in users:

            user1, user2 = users

            now = time.time()

            cooldowns.setdefault(user1, {})[user2] = now + COOLDOWN_TIME
            cooldowns.setdefault(user2, {})[user1] = now + COOLDOWN_TIME

            print(f"Cooldown set between {user1} and {user2}")

            if user1 not in queue:
                queue.append(user1)
            if user2 not in queue:
                queue.append(user2)

            print("Requeued:", user1, user2)

            del rooms[room_id]

            await sio.emit("skip", room=room_id)

            break

    await try_match()


# -------------------------
# SIGNALING
# -------------------------

@sio.event
async def offer(sid, data):

    print("Offer from:", sid)

    await sio.emit("offer", data, room=data["room"], skip_sid=sid)


@sio.event
async def answer(sid, data):

    print("Answer from:", sid)

    await sio.emit("answer", data, room=data["room"], skip_sid=sid)


@sio.event
async def ice_candidate(sid, data):

    await sio.emit("ice_candidate", data, room=data["room"], skip_sid=sid)


# -------------------------
# CHAT
# -------------------------

MAX_CHAT_LENGTH = 500

@sio.event
async def chat_message(sid, data):

    room = data.get("room")
    text = (data.get("text") or "").strip()

    if not room or room not in rooms:
        return

    if sid not in rooms[room]:
        return

    if not text:
        return

    text = text[:MAX_CHAT_LENGTH]

    print(f"Chat in {room} from {sid}: {text}")

    await sio.emit("chat_message", {"text": text}, room=room, skip_sid=sid)


# -------------------------
# MATCHMAKING
# -------------------------

def can_match(u1, u2):

    if user_modes.get(u1) != user_modes.get(u2):
        return False

    now = time.time()

    if u1 in cooldowns:
        expiry = cooldowns[u1].get(u2)
        if expiry:
            if expiry < now:
                del cooldowns[u1][u2]
            else:
                return False

    if u2 in cooldowns:
        expiry = cooldowns[u2].get(u1)
        if expiry:
            if expiry < now:
                del cooldowns[u2][u1]
            else:
                return False

    return True


async def try_match():

    i = 0

    while i < len(queue):

        j = i + 1

        while j < len(queue):

            user1 = queue[i]
            user2 = queue[j]

            if can_match(user1, user2):

                queue.remove(user1)
                queue.remove(user2)

                room_id = str(uuid.uuid4())[:8]

                rooms[room_id] = [user1, user2]

                await sio.enter_room(user1, room_id)
                await sio.enter_room(user2, room_id)

                print("\nMATCH CREATED")
                print("Room:", room_id)
                print("User1:", user1)
                print("User2:", user2)

                await sio.emit(
                    "match_found",
                    {"room": room_id, "initiator": True},
                    to=user1
                )

                await sio.emit(
                    "match_found",
                    {"room": room_id, "initiator": False},
                    to=user2
                )

                return

            j += 1

        i += 1