import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// =====================
// API (仮実装)
// =====================
// NOTE: ここは“動作確認用”です。
// あなたの本来のデータ取得ロジック/DB接続があるなら、後で置き換えます。
app.get("/api/status/today", (req, res) => {
  res.json({ ok: true, date: new Date().toISOString() });
});

app.get("/api/menu", (req, res) => res.json([]));
app.get("/api/options", (req, res) => res.json([]));
app.get("/api/ticket_packs", (req, res) => res.json([]));
app.get("/api/orders/today", (req, res) => res.json([]));

// =====================
// Static (Vite build output)
// =====================
const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir));

// SPA fallback: React Router等で直リンクしてもindex.htmlを返す
app.get("*", (req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

// =====================
// HTTP + Socket.IO
// =====================
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  // 同一ドメインで使う想定。必要なら後でoriginを絞ります。
  cors: { origin: true, credentials: true },
});

io.on("connection", (socket) => {
  // 接続確認用
  socket.emit("server:hello", { message: "connected" });

  // 例: クライアントからpingが来たらpong
  socket.on("client:ping", () => {
    socket.emit("server:pong", { at: Date.now() });
  });
});

// RenderはPORT環境変数を渡すので必ずそれを使う
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
