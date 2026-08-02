# SSNgle

SSNgle is a simple random video chat application. It matches two users and connects them using WebRTC for real-time video and audio communication.

## Features

- Choose between video chat and text-only chat
- Random matchmaking within your selected mode
- Peer-to-peer video chat (WebRTC)
- Real-time text chat while connected
- Skip to next user
- Cooldown to avoid instant rematch
- One session per browser
- STUN/TURN support

## Tech Stack

- FastAPI
- Python Socket.IO
- WebRTC
- Vanilla JS

## Project Structure

```
SSNgle/
├── server.py
├── index.html
├── requirements.txt
├── static/
│   ├── script.js
│   └── style.css
└── .env
```

## Setup

### 1. Install dependencies

```
pip install -r requirements.txt
```

### 2. Add environment variables

Create a `.env` file:

```
TURN_URL=your_turn_url
TURN_USER=your_turn_user
TURN_PASS=your_turn_password
```

### 3. Run the server

```
uvicorn server:socket_app --host 0.0.0.0 --port 8000
```

### 4. Open in browser

```
http://localhost:8000
```

## How it works

- Users connect to the server
- Server pairs users into a room
- WebRTC establishes a direct connection
- Users can skip and get matched again

## Notes

- TURN server is required for reliable connections
- Static files are served from `/static`
