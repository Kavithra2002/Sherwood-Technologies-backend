const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const net = require("net");
const nodemailer = require("nodemailer");
require("dotenv").config();

const { createUserTask, listUserTasks } = require("./userTasksController");
const { initDb, getPool } = require("./db");

const app = express();

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5174";
const EMAIL_TO = process.env.EMAIL_TO || "kmethnula@gmail.com";

const mailTransport =
  process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS
    ? nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === "true",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      })
    : null;

async function sendConsultationEmail(user) {
  if (!mailTransport) {
    console.warn("Mail transport not configured. Skipping email send.");
    return;
  }

  const { firstName, lastName, email, contactNumber, id } = user;

  const subject = `New consultation booking: ${firstName} ${lastName}`;
  const textBody = `
This user has booked a consultation session.

User details:
- ID: ${id ?? "N/A"}
- First name: ${firstName}
- Last name: ${lastName}
- Email: ${email}
- Contact number: ${contactNumber}

Booked at: ${new Date().toISOString()}
`.trim();

  await mailTransport.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: EMAIL_TO,
    subject,
    text: textBody,
  });
}

const allowedOrigins = new Set([
  CLIENT_ORIGIN,
  "http://localhost:5174",
  "http://localhost:8080",
]);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / non-browser requests (like curl, Postman) where origin may be undefined
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      console.warn(`Blocked CORS request from origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
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

app.post("/api/users", async (req, res) => {
  const { firstName, lastName, email, contactNumber } = req.body || {};

  if (
    !firstName ||
    !lastName ||
    !email ||
    !contactNumber ||
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    typeof email !== "string" ||
    typeof contactNumber !== "string"
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const pool = getPool();

    const [result] = await pool.query(
      `
        INSERT INTO users (first_name, last_name, email, contact_number)
        VALUES (?, ?, ?, ?)
      `,
      [
        firstName.trim(),
        lastName.trim(),
        email.trim(),
        contactNumber.trim()
      ]
    );

    const insertedId = result.insertId;

    const user = {
      id: insertedId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      contactNumber: contactNumber.trim(),
    };

    try {
      await sendConsultationEmail(user);
    } catch (emailErr) {
      console.error("Failed to send consultation email:", emailErr);
      // Do not fail the API just because email failed.
    }

    res.status(201).json(user);
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "A user with this email already exists." });
    }
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Failed to save user details." });
  }
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

function findAvailablePort(startPort, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function tryPort(port) {
      const tester = net.createServer()
        .once("error", (err) => {
          if (err.code === "EADDRINUSE") {
            attempts += 1;
            if (attempts >= maxAttempts) {
              reject(
                new Error(
                  `No available port found from ${startPort} after ${maxAttempts} attempts`
                )
              );
            } else {
              tryPort(port + 1);
            }
          } else {
            reject(err);
          }
        })
        .once("listening", () => {
          tester.close(() => resolve(port));
        })
        .listen(port);
    }

    tryPort(startPort);
  });
}

async function startServer() {
  const dbResult = await initDb();

  if (!dbResult.ok) {
    console.warn("Database initialization failed. The server will still start, but DB features may not work.");
  }

  const actualPort = await findAvailablePort(PORT);

  if (actualPort !== PORT) {
    console.warn(
      `Port ${PORT} is in use. Server started instead on available port ${actualPort}.`
    );
  }

  app.listen(actualPort, () => {
    console.log(`Backend listening on port ${actualPort}`);
    console.log(`Expected frontend origin: ${CLIENT_ORIGIN}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error while starting the server:", err);
  process.exit(1);
});

