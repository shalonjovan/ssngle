import uuid
from fastapi import FastAPI
import socketio
from fastapi.responses import FileResponse

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*"
)

app = FastAPI()
socket_app = socketio.ASGIApp(sio, app)

queue = []
rooms = {}


@app.get("/")
async def root():
    return {
        "queue_length": len(queue),
        "rooms": rooms
    }
@app.get("/test")
def index():
    return FileResponse("test.html")


# -------------------------
# CONNECT
# -------------------------

@sio.event
async def connect(sid, environ):

    print("\nUser connected:", sid)

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

            users.remove(sid)

            print("User left room:", room_id)

            if users:

                other_user = users[0]

                print("Re-queue remaining user:", other_user)

                queue.append(other_user)

            del rooms[room_id]

            break

    print("Queue:", queue)
    print("Rooms:", rooms)

    await try_match()


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

        print("\nMATCH CREATED")
        print("Room:", room_id)
        print("Users:", user1, user2)
        print("Active Rooms:", rooms)