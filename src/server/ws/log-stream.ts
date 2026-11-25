import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { processManager } from "../services/process-manager.js";
import { sessionManager } from "../services/session-manager.js";
import type { WsMessage } from "../types.js";

export function setupWebSocket(server: Server): () => void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  // `ws` re-emits the HTTP server's listen error. With no listener, Node
  // crashes the process and the next-port fallback never runs.
  wss.on("error", () => {});

  // Track which script each client is subscribed to
  const subscriptions = new Map<WebSocket, string>();

  const broadcast = (message: string) => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  const unsubLog = processManager.onLog((id, stream, data) => {
    const message = JSON.stringify({
      type: "log",
      id,
      stream,
      data,
    } satisfies WsMessage);

    for (const [client, subId] of subscriptions) {
      if (subId === id && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  const unsubStatus = processManager.onStatus((id, status, exitCode) => {
    const message = JSON.stringify({
      type: "status",
      id,
      status,
      exitCode,
    } satisfies WsMessage);

    // Broadcast status changes to ALL connected clients (not just subscribed)
    broadcast(message);
  });

  const unsubSession = sessionManager.onUpdate((session) => {
    broadcast(
      JSON.stringify({
        type: "session",
        session,
      } satisfies WsMessage)
    );
  });

  const unsubQueue = processManager.onQueue((ids) => {
    broadcast(JSON.stringify({ type: "queue", ids } satisfies WsMessage));
  });

  wss.on("connection", (ws) => {
    ws.send(
      JSON.stringify({
        type: "queue",
        ids: processManager.queueIds(),
      } satisfies WsMessage)
    );

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage;

        if (msg.type === "subscribe" && msg.id) {
          subscriptions.set(ws, msg.id);

          // Replay buffer
          const buffer = processManager.getLogBuffer(msg.id);
          ws.send(
            JSON.stringify({
              type: "history",
              id: msg.id,
              lines: buffer,
            } satisfies WsMessage)
          );
        }

        if (msg.type === "unsubscribe") {
          subscriptions.delete(ws);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      subscriptions.delete(ws);
    });
  });

  return () => {
    unsubLog();
    unsubStatus();
    unsubSession();
    unsubQueue();
    try {
      wss.close();
    } catch {
      // ignore
    }
  };
}
