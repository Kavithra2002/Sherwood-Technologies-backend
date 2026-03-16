const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const { createUserTask, listUserTasks } = require("./userTasksController");
const { initDb, getPool } = require("./db");

const app = express();

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:8080";

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", async (req, res) => {
  let dbStatus = "unknown";

  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    dbStatus = "connected";
  } catch (err) {
    dbStatus = "not_connected";
  }

  res.json({
    status: "ok",
    service: "web-backend",
    dbStatus,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/users/:userId/tasks", (req, res) => {
  const { userId } = req.params;
  const tasks = listUserTasks(userId);
  res.json({ userId, tasks });
});

app.post("/api/users/:userId/tasks", (req, res) => {
  const { userId } = req.params;
  const { title, completed } = req.body || {};

  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Task title is required." });
  }

  const task = createUserTask(userId, { title, completed: Boolean(completed) });
  res.status(201).json({ userId, task });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function startServer() {
  const dbResult = await initDb();

  if (!dbResult.ok) {
    console.warn("Database initialization failed. The server will still start, but DB features may not work.");
  }

  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
    console.log(`Expected frontend origin: ${CLIENT_ORIGIN}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error while starting the server:", err);
  process.exit(1);
});

