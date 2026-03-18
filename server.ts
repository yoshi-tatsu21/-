import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("bento.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS menu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    price INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    role TEXT NOT NULL,
    menu_id INTEGER NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    change_amount INTEGER DEFAULT 0,
    option TEXT, -- '大盛り', 'ご飯なし'
    ticket_purchase TEXT, -- '6枚3300円', '10枚5500円'
    memo TEXT,
    can_be_representative BOOLEAN DEFAULT 0,
    paid BOOLEAN DEFAULT 0,
    created_at DATE DEFAULT (DATE('now', 'localtime')),
    FOREIGN KEY (menu_id) REFERENCES menu(id)
  );

  CREATE TABLE IF NOT EXISTS daily_status (
    date DATE PRIMARY KEY DEFAULT (DATE('now', 'localtime')),
    representative_name TEXT,
    is_ordered BOOLEAN DEFAULT 0
  );
`);

// Initial menu items if empty
const menuCount = db.prepare("SELECT COUNT(*) as count FROM menu").get() as { count: number };
if (menuCount.count === 0) {
  const insertMenu = db.prepare("INSERT INTO menu (name, price) VALUES (?, ?)");
  insertMenu.run("日替わり", 600);
  insertMenu.run("生姜焼き", 600);
  insertMenu.run("唐揚げ", 600);
  insertMenu.run("鮭（ないこともある）", 600);
  insertMenu.run("味噌カツ", 600);
  insertMenu.run("チキン南蛮", 600);
  insertMenu.run("油淋鶏", 600);
}

// Initial options if empty
const optionsCount = db.prepare("SELECT COUNT(*) as count FROM options").get() as { count: number };
if (optionsCount.count === 0) {
  const insertOption = db.prepare("INSERT INTO options (name) VALUES (?)");
  insertOption.run("大盛り");
  insertOption.run("ご飯なし");
}

// Initial ticket packs if empty
const ticketPacksCount = db.prepare("SELECT COUNT(*) as count FROM ticket_packs").get() as { count: number };
if (ticketPacksCount.count === 0) {
  const insertTicketPack = db.prepare("INSERT INTO ticket_packs (label, price) VALUES (?, ?)");
  insertTicketPack.run("6枚3300円", 3300);
  insertTicketPack.run("10枚5500円", 5500);
}

// Representative selection logic
function selectRepresentative() {
  const now = new Date();
  const todayStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  
  // Check if it's 09:30
  if (now.getHours() === 9 && now.getMinutes() === 30) {
    const status = db.prepare("SELECT * FROM daily_status WHERE date = DATE('now', 'localtime')").get() as any;
    if (status && !status.representative_name) {
      const eligibleOrders = db.prepare(`
        SELECT user_name FROM orders 
        WHERE created_at = DATE('now', 'localtime') 
        AND can_be_representative = 1
      `).all() as { user_name: string }[];

      if (eligibleOrders.length > 0) {
        const randomIndex = Math.floor(Math.random() * eligibleOrders.length);
        const selected = eligibleOrders[randomIndex].user_name;
        db.prepare("UPDATE daily_status SET representative_name = ? WHERE date = DATE('now', 'localtime')").run(selected);
        return selected;
      }
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer);
  const PORT = Number(process.env.PORT) || 3000;

  // Check for representative and cleanup every minute
  setInterval(() => {
    const now = new Date();
    
    // Emit update at midnight to clear the UI for all connected clients
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      io.emit("update");
    }

    // Delete all orders at 20:00
    if (now.getHours() === 20 && now.getMinutes() === 0) {
      db.prepare("DELETE FROM orders WHERE created_at = DATE('now', 'localtime')").run();
      db.prepare("UPDATE daily_status SET is_ordered = 0 WHERE date = DATE('now', 'localtime')").run();
      io.emit("update");
      io.emit("notification", { message: "20時を過ぎたため、本日の注文データは削除されました。" });
    }

    const selected = selectRepresentative();
    if (selected) {
      io.emit("update");
      io.emit("notification", { message: `今日の担当は ${selected} さんに決定しました！` });
    }
  }, 60000);

  app.use(express.json());

  // API Routes
  app.get("/api/menu", (req, res) => {
    try {
      const menu = db.prepare("SELECT * FROM menu").all();
      res.json(menu);
    } catch (error) {
      console.error('Menu fetch error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post("/api/menu", (req, res) => {
    try {
      const { name, price } = req.body;
      const result = db.prepare("INSERT INTO menu (name, price) VALUES (?, ?)").run(name, price);
      io.emit("update");
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      console.error('Menu creation error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.patch("/api/menu/:id", (req, res) => {
    try {
      const { name, price } = req.body;
      db.prepare("UPDATE menu SET name = ?, price = ? WHERE id = ?").run(name, price, req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Menu update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.delete("/api/menu/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM menu WHERE id = ?").run(req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Menu deletion error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Options API
  app.get("/api/options", (req, res) => {
    try {
      const options = db.prepare("SELECT * FROM options").all();
      res.json(options);
    } catch (error) {
      console.error('Options fetch error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post("/api/options", (req, res) => {
    try {
      const { name } = req.body;
      const result = db.prepare("INSERT INTO options (name) VALUES (?)").run(name);
      io.emit("update");
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      console.error('Option creation error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.patch("/api/options/:id", (req, res) => {
    try {
      const { name } = req.body;
      db.prepare("UPDATE options SET name = ? WHERE id = ?").run(name, req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Option update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.delete("/api/options/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM options WHERE id = ?").run(req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Option deletion error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Ticket Packs API
  app.get("/api/ticket_packs", (req, res) => {
    try {
      const packs = db.prepare("SELECT * FROM ticket_packs").all();
      res.json(packs);
    } catch (error) {
      console.error('Ticket packs fetch error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post("/api/ticket_packs", (req, res) => {
    try {
      const { label, price } = req.body;
      const result = db.prepare("INSERT INTO ticket_packs (label, price) VALUES (?, ?)").run(label, price);
      io.emit("update");
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      console.error('Ticket pack creation error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.patch("/api/ticket_packs/:id", (req, res) => {
    try {
      const { label, price } = req.body;
      db.prepare("UPDATE ticket_packs SET label = ?, price = ? WHERE id = ?").run(label, price, req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Ticket pack update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.delete("/api/ticket_packs/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM ticket_packs WHERE id = ?").run(req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Ticket pack deletion error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get("/api/orders/today", (req, res) => {
    try {
      const orders = db.prepare(`
        SELECT o.*, m.name as menu_name, m.price
        FROM orders o
        JOIN menu m ON o.menu_id = m.id
        WHERE o.created_at = DATE('now', 'localtime')
      `).all();
      res.json(orders);
    } catch (error) {
      console.error('Orders fetch error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get("/api/status/today", (req, res) => {
    try {
      let status = db.prepare("SELECT * FROM daily_status WHERE date = DATE('now', 'localtime')").get();
      if (!status) {
        db.prepare("INSERT INTO daily_status (date) VALUES (DATE('now', 'localtime'))").run();
        status = db.prepare("SELECT * FROM daily_status WHERE date = DATE('now', 'localtime')").get();
      }
      res.json(status);
    } catch (error) {
      console.error('Status fetch error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.post("/api/orders", (req, res) => {
    try {
      const { user_name, role, menu_id, payment_method, change_amount, option, ticket_purchase, memo, can_be_representative } = req.body;
      const result = db.prepare(`
        INSERT INTO orders (user_name, role, menu_id, payment_method, change_amount, option, ticket_purchase, memo, can_be_representative) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user_name, role, menu_id, payment_method || 'cash', change_amount || 0, option, ticket_purchase, memo, can_be_representative ? 1 : 0);
      io.emit("update");
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      console.error('Order creation error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.patch("/api/orders/:id/pay", (req, res) => {
    try {
      const { paid } = req.body;
      db.prepare("UPDATE orders SET paid = ? WHERE id = ?").run(paid ? 1 : 0, req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Payment update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.delete("/api/orders/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM orders WHERE id = ?").run(req.params.id);
      io.emit("update");
      res.json({ success: true });
    } catch (error) {
      console.error('Order deletion error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.patch("/api/status/today", (req, res) => {
    try {
      const { representative_name, is_ordered } = req.body;
      const fields = [];
      const values = [];
      if (representative_name !== undefined) { fields.push("representative_name = ?"); values.push(representative_name); }
      if (is_ordered !== undefined) { fields.push("is_ordered = ?"); values.push(is_ordered ? 1 : 0); }
      
      if (fields.length > 0) {
        db.prepare(`UPDATE daily_status SET ${fields.join(", ")} WHERE date = DATE('now', 'localtime')`).run(...values);
        io.emit("update");
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Status update error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
