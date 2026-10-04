const express = require("express");
const http = require("http");
const crypto = require("crypto");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const sessions = new Map();

function createId() {
  return crypto.randomBytes(16).toString("hex");
}

app.post("/api/session", (req, res) => {
  const id = createId();

  sessions.set(id, {
    operator: null,
    client: null,
    createdAt: Date.now()
  });

  res.json({
    id,
    url: `/client.html?session=${id}`
  });
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const sessionId = url.searchParams.get("session");
  const role = url.searchParams.get("role");

  if (!sessionId || !sessions.has(sessionId)) {
    ws.close();
    return;
  }

  if (!["operator", "client"].includes(role)) {
    ws.close();
    return;
  }

  const session = sessions.get(sessionId);

  if (session[role]) {
    ws.close();
    return;
  }

  session[role] = ws;

  ws.send(JSON.stringify({
    type: "connected",
    sessionId
  }));

  ws.on("message", data => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    const targetRole = role === "operator"
      ? "client"
      : "operator";

    const target = session[targetRole];

    if (target && target.readyState === WebSocket.OPEN) {
      target.send(JSON.stringify(message));
    }
  });

  ws.on("close", () => {
    if (session[role] === ws) {
      session[role] = null;
    }

    const otherRole = role === "operator"
      ? "client"
      : "operator";

    const other = session[otherRole];

    if (other && other.readyState === WebSocket.OPEN) {
      other.send(JSON.stringify({
        type: "peer-disconnected"
      }));
    }
  });
});

setInterval(() => {
  const now = Date.now();

  for (const [id, session] of sessions) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      session.operator?.close();
      session.client?.close();
      sessions.delete(id);
    }
  }
}, 60_000);

server.listen(3000, () => {
  console.log("Server: http://localhost:3000");
});