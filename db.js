const mysql = require("mysql2/promise");

let pool = null;

async function initDb() {
  const {
    MYSQL_HOST,
    MYSQL_PORT,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_DATABASE,
  } = process.env;

  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
    console.error("MySQL environment variables are not fully set.");
    console.log("The DB is not connected");
    return { ok: false, error: "MySQL env vars missing" };
  }

  try {
    pool = mysql.createPool({
      host: MYSQL_HOST,
      port: Number(MYSQL_PORT) || 3306,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    await pool.query("SELECT 1");
    console.log("The DB is connected successfully");
    return { ok: true };
  } catch (error) {
    console.error("Error connecting to the database:", error.message);
    console.log("The DB is not connected");
    return { ok: false, error: error.message };
  }
}

function getPool() {
  if (!pool) {
    throw new Error("Database pool has not been initialized. Call initDb() first.");
  }
  return pool;
}

module.exports = {
  initDb,
  getPool,
};

