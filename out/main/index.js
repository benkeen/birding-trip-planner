import { app, Menu, ipcMain, BrowserWindow } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import Database from "better-sqlite3";
import fs from "fs";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import __cjs_url__ from "node:url";
import __cjs_path__ from "node:path";
import __cjs_mod__ from "node:module";
const __filename = __cjs_url__.fileURLToPath(import.meta.url);
const __dirname = __cjs_path__.dirname(__filename);
const require2 = __cjs_mod__.createRequire(import.meta.url);
let db;
function initializeDatabase() {
  const dbPath = path.join(app.getPath("userData"), "app.db");
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  const schemaPath = path.join(__dirname, "../../db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);
}
function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}
function getUserByEmail(email) {
  const db2 = getDatabase();
  const stmt = db2.prepare("SELECT id, email, created_at, updated_at FROM users WHERE email = ?");
  return stmt.get(email);
}
function createUser(email, passwordHash) {
  const db2 = getDatabase();
  const stmt = db2.prepare(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)"
  );
  const result = stmt.run(email, passwordHash);
  return getUserById(result.lastInsertRowid);
}
function getUserById(id) {
  const db2 = getDatabase();
  const stmt = db2.prepare("SELECT id, email, created_at, updated_at FROM users WHERE id = ?");
  return stmt.get(id);
}
function getUserPasswordHash(email) {
  const db2 = getDatabase();
  const stmt = db2.prepare("SELECT password_hash FROM users WHERE email = ?");
  const result = stmt.get(email);
  return result?.password_hash || null;
}
function getUserTrips(userId) {
  const db2 = getDatabase();
  const stmt = db2.prepare(
    "SELECT * FROM trips WHERE user_id = ? ORDER BY updated_at DESC"
  );
  return stmt.all(userId);
}
function getTripById(tripId, userId) {
  const db2 = getDatabase();
  const stmt = db2.prepare("SELECT * FROM trips WHERE id = ? AND user_id = ?");
  return stmt.get(tripId, userId);
}
function createTrip(userId, name, location, startDate, endDate, latitude, longitude) {
  const db2 = getDatabase();
  const stmt = db2.prepare(
    `INSERT INTO trips (user_id, name, location, latitude, longitude, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(userId, name, location, latitude || null, longitude || null, startDate, endDate);
  return getTripById(result.lastInsertRowid, userId);
}
function updateTrip(tripId, userId, updates) {
  const db2 = getDatabase();
  const fields = Object.keys(updates).filter((key) => !["id", "user_id", "created_at"].includes(key)).map((key) => `${key} = ?`).join(", ");
  const values = fields.split(", ").map((f) => f.split(" = ")[0]).map((key) => updates[key]);
  const stmt = db2.prepare(
    `UPDATE trips SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
  );
  stmt.run(...values, tripId, userId);
  return getTripById(tripId, userId);
}
function deleteTrip(tripId, userId) {
  const db2 = getDatabase();
  const stmt = db2.prepare("DELETE FROM trips WHERE id = ? AND user_id = ?");
  const result = stmt.run(tripId, userId);
  return (result.changes || 0) > 0;
}
function closeDatabase() {
  if (db) {
    db.close();
  }
}
const JWT_SECRET = "your-secret-key-change-in-production";
function createExpressApp() {
  const app2 = express();
  app2.use(cors());
  app2.use(bodyParser.json());
  const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
    }
  };
  app2.post("/api/auth/signup", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const existing = getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "User already exists" });
    }
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const user = createUser(email, passwordHash);
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user });
    } catch (err) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    try {
      const passwordHash = getUserPasswordHash(email);
      if (!passwordHash) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(password, passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user });
    } catch (err) {
      res.status(500).json({ error: "Login failed" });
    }
  });
  app2.get("/api/auth/me", authMiddleware, (req, res) => {
    const user = getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  });
  const EBIRD_API_BASE = "https://api.ebird.org/v2";
  app2.post("/api/ebird/validate-key", async (req, res) => {
    const { api_key } = req.body;
    if (!api_key) {
      return res.status(400).json({ error: "API key required" });
    }
    try {
      const response = await fetch(`${EBIRD_API_BASE}/ref/taxonomy?key=${api_key}`);
      if (!response.ok) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      res.json({ valid: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to validate API key" });
    }
  });
  app2.get("/api/ebird/species/:region", async (req, res) => {
    const { region } = req.params;
    const { api_key } = req.query;
    if (!api_key) {
      return res.status(400).json({ error: "API key required" });
    }
    try {
      const response = await fetch(
        `${EBIRD_API_BASE}/product/spplist/${region}?key=${api_key}`
      );
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch species list" });
      }
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch species" });
    }
  });
  app2.get("/api/ebird/observations/:region/:species", async (req, res) => {
    const { region, species } = req.params;
    const { api_key, back = "30" } = req.query;
    if (!api_key) {
      return res.status(400).json({ error: "API key required" });
    }
    try {
      const response = await fetch(
        `${EBIRD_API_BASE}/data/obs/${region}/recent?sppCode=${species}&back=${back}&key=${api_key}`
      );
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch observations" });
      }
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch observations" });
    }
  });
  app2.get("/api/ebird/hotspots/:region", async (req, res) => {
    const { region } = req.params;
    const { api_key } = req.query;
    if (!api_key) {
      return res.status(400).json({ error: "API key required" });
    }
    try {
      const response = await fetch(
        `${EBIRD_API_BASE}/ref/hotspot/${region}?key=${api_key}`
      );
      if (!response.ok) {
        return res.status(response.status).json({ error: "Failed to fetch hotspots" });
      }
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch hotspots" });
    }
  });
  app2.get("/api/trips", authMiddleware, (req, res) => {
    const trips = getUserTrips(req.userId);
    res.json(trips);
  });
  app2.get("/api/trips/:id", authMiddleware, (req, res) => {
    const trip = getTripById(parseInt(req.params.id), req.userId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    res.json(trip);
  });
  app2.post("/api/trips", authMiddleware, async (req, res) => {
    const { name, location, latitude, longitude, start_date, end_date } = req.body;
    if (!name || !location || !start_date || !end_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    try {
      const trip = createTrip(
        req.userId,
        name,
        location,
        start_date,
        end_date,
        latitude,
        longitude
      );
      res.status(201).json(trip);
    } catch (err) {
      res.status(500).json({ error: "Failed to create trip" });
    }
  });
  app2.put("/api/trips/:id", authMiddleware, (req, res) => {
    const trip = getTripById(parseInt(req.params.id), req.userId);
    if (!trip) {
      return res.status(404).json({ error: "Trip not found" });
    }
    try {
      const updated = updateTrip(parseInt(req.params.id), req.userId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update trip" });
    }
  });
  app2.delete("/api/trips/:id", authMiddleware, (req, res) => {
    const success = deleteTrip(parseInt(req.params.id), req.userId);
    if (!success) {
      return res.status(404).json({ error: "Trip not found" });
    }
    res.status(204).send();
  });
  app2.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  return app2;
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "../..");
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
let mainWindow = null;
let expressServer = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname$1, "../preload/preload.js")
    }
  });
  const isDev = process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../renderer/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function startServer() {
  const app2 = createExpressApp();
  const PORT = process.env.SERVER_PORT || 3e3;
  expressServer = app2.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
  });
}
app.on("ready", () => {
  initializeDatabase();
  startServer();
  createWindow();
  createMenu();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
app.on("quit", () => {
  closeDatabase();
  if (expressServer) {
    expressServer.close();
  }
});
function createMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: "CmdOrCtrl+Q",
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" }
      ]
    }
  ];
  if (process.env.NODE_ENV === "development") {
    template.push({
      label: "Development",
      submenu: [
        {
          label: "Toggle DevTools",
          accelerator: "F12",
          click: () => {
            mainWindow?.webContents.toggleDevTools();
          }
        }
      ]
    });
  }
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
ipcMain.handle("get-app-path", () => {
  return app.getAppPath();
});
