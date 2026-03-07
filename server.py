import uuid
import time
from fastapi import FastAPI
import socketio
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

app = FastAPI()

app.mount("/static", StaticFiles(directory="."), name="static")

socket_app = socketio.ASGIApp(sio, app)

queue = []
rooms = {}

# user -> {blocked_user : expiry_time}
cooldowns = {}

COOLDOWN_TIME = 10


@app.get("/")
def index():
    return FileResponse("index.html")


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

    queue.append(sid)

    print("Queue:", queue)

    await try_match()


# -------------------------
# DISCONNECT
# -------------------------

@sio.event
async def disconnect(sid):

    print("\nUser disconnected:", sid)

    if sid in queue:
        queue.remove(sid)

    for room_id, users in list(rooms.items()):

        if sid in users:

            print("User left room:", room_id)

            users.remove(sid)

            if users:
                other = users[0]
                print("Requeue remaining user:", other)
                queue.append(other)

            del rooms[room_id]
            break

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

            # add cooldown
            cooldowns.setdefault(user1, {})[user2] = now + COOLDOWN_TIME
            cooldowns.setdefault(user2, {})[user1] = now + COOLDOWN_TIME

            print(f"Cooldown set between {user1} and {user2}")

            queue.append(user1)
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
# MATCHMAKING
# -------------------------

def can_match(u1, u2):

    now = time.time()

    if u1 in cooldowns:
        expiry = cooldowns[u1].get(u2)
        if expiry and expiry > now:
            return False

    if u2 in cooldowns:
        expiry = cooldowns[u2].get(u1)
        if expiry and expiry > now:
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