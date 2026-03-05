import uuid
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


@app.get("/")
def index():
    return FileResponse("index.html")


# -------------------------
# CONNECT
# -------------------------

@sio.event
async def connect(sid, environ):

    client_ip = environ.get("REMOTE_ADDR")

    print("\n==============================")
    print("User Connected")
    print("SID:", sid)
    print("IP:", client_ip)

    queue.append(sid)

    print("Added to Queue")
    print("Queue:", queue)
    print("==============================")

    await try_match()


# -------------------------
# DISCONNECT
# -------------------------

@sio.event
async def disconnect(sid):

    print("\n==============================")
    print("User Disconnected:", sid)

    if sid in queue:
        queue.remove(sid)
        print("Removed from queue")

    for room_id, users in list(rooms.items()):

        if sid in users:

            print("User was in room:", room_id)

            users.remove(sid)

            if users:
                other = users[0]

                print("Remaining user:", other)
                print("Requeueing remaining user")

                queue.append(other)

            print("Deleting room:", room_id)

            del rooms[room_id]
            break

    print("Queue:", queue)
    print("Rooms:", rooms)
    print("==============================")

    await try_match()


# -------------------------
# SKIP
# -------------------------

@sio.event
async def skip(sid):

    print("\n==============================")
    print("Skip requested by:", sid)

    for room_id, users in list(rooms.items()):

        if sid in users:

            print("Room:", room_id)
            print("Users:", users)

            user1, user2 = users

            queue.append(user1)
            queue.append(user2)

            print("Requeued users:", user1, user2)

            del rooms[room_id]

            await sio.emit("skip", room=room_id)

            print("Room deleted:", room_id)

            break

    print("Queue:", queue)
    print("Rooms:", rooms)
    print("==============================")

    await try_match()


# -------------------------
# SIGNALING
# -------------------------

@sio.event
async def offer(sid, data):

    print("\nOffer received from:", sid)
    print("Room:", data["room"])

    await sio.emit("offer", data, room=data["room"], skip_sid=sid)


@sio.event
async def answer(sid, data):

    print("\nAnswer received from:", sid)
    print("Room:", data["room"])

    await sio.emit("answer", data, room=data["room"], skip_sid=sid)


@sio.event
async def ice_candidate(sid, data):

    print("\nICE candidate from:", sid)
    print("Room:", data["room"])

    await sio.emit("ice_candidate", data, room=data["room"], skip_sid=sid)


# -------------------------
# MATCHMAKING
# -------------------------

async def try_match():

    while len(queue) >= 2:

        user1 = queue.pop(0)
        user2 = queue.pop(0)

        room_id = str(uuid.uuid4())[:8]

        rooms[room_id] = [user1, user2]

        await sio.enter_room(user1, room_id)
        await sio.enter_room(user2, room_id)

        print("\n==============================")
        print("MATCH CREATED")
        print("Room:", room_id)
        print("User1:", user1)
        print("User2:", user2)
        print("Active Rooms:", rooms)
        print("==============================")

        await sio.emit(
            "match_found",
            {"room": room_id},
            room=room_id
        )