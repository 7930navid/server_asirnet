require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const app = express();
app.use(helmet());
app.use(bodyParser.json());

app.use(
  cors({
    origin: ["https://7930navid.github.io", "http://localhost:8080"],
  })
);

// 🔹 Common Pool Config
const baseConfig = {
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
};

// 🔹 3 Databases
const usersDB = new Pool({
  ...baseConfig,
  connectionString: process.env.USERS_DB_URL,
});

const postsDB = new Pool({
  ...baseConfig,
  connectionString: process.env.POSTS_DB_URL,
});

const interactDB = new Pool({
  ...baseConfig,
  connectionString: process.env.INTERACT_DB_URL,
});

// 🔹 Initialize Tables (SAFE)
async function initDB() {
  try {
    await usersDB.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        bio TEXT NOT NULL,
        avatar TEXT NOT NULL
      );
    `);

    await postsDB.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        email TEXT NOT NULL,
        text TEXT NOT NULL,
        avatar TEXT NOT NULL
      );
    `);

    await interactDB.query(`
      CREATE TABLE IF NOT EXISTS likes (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL,
        email TEXT NOT NULL,
        reaction TEXT
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        post_id INT NOT NULL,
        email TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ All databases ready");
  } catch (err) {
    console.error("❌ DB Init Error:", err.message);
  }
}

/* ========================= AUTH ========================= */

// 🔹 Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, bio, avatar } = req.body;
    if (!username || !email || !password || !bio || !avatar)
      return res.status(400).json({ message: "All fields required" });

    const exists = await usersDB.query(
      "SELECT 1 FROM users WHERE email=$1",
      [email]
    );
    if (exists.rows.length)
      return res.status(400).json({ message: "User already exists" });

    const hash = await bcrypt.hash(password, 10);

    await usersDB.query(
      `INSERT INTO users (username,email,password,bio,avatar)
       VALUES ($1,$2,$3,$4,$5)`,
      [username, email, hash, bio, avatar]
    );

    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Signup failed" });
  }
});

// 🔹 Signin
app.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await usersDB.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (!result.rows.length)
      return res.status(401).json({ message: "Invalid credentials" });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    delete user.password;
    res.json({ message: "Login success", user });
  } catch {
    res.status(500).json({ message: "Login error" });
  }
});

/* ========================= POSTS ========================= */

// 🔹 Create Post
app.post("/post", async (req, res) => {
  try {
    const { username, text, avatar } = req.body;
    if (!text) return res.status(400).json({ message: "Empty post" });

    const u = await usersDB.query(
      "SELECT email FROM users WHERE username=$1",
      [username]
    );
    if (!u.rows.length)
      return res.status(404).json({ message: "User not found" });

    await postsDB.query(
      `INSERT INTO posts (username,email,text,avatar)
       VALUES ($1,$2,$3,$4)`,
      [username, u.rows[0].email, text, avatar]
    );

    res.json({ message: "Post created" });
  } catch {
    res.status(500).json({ message: "Post error" });
  }
});

// 🔹 Get Posts
app.get("/post", async (_, res) => {
  const posts = await postsDB.query("SELECT * FROM posts ORDER BY id DESC");
  res.json(posts.rows);
});

// 🔹 Edit Post
app.put("/post/:email/:id", async (req, res) => {
  const { email, id } = req.params;
  const { text } = req.body;

  const r = await postsDB.query(
    "UPDATE posts SET text=$1 WHERE id=$2 AND email=$3",
    [text, id, email]
  );

  r.rowCount
    ? res.json({ message: "Updated" })
    : res.status(404).json({ message: "Not found" });
});

// 🔹 Delete Post
app.delete("/post/:email/:id", async (req, res) => {
  const { email, id } = req.params;
  const r = await postsDB.query(
    "DELETE FROM posts WHERE id=$1 AND email=$2",
    [id, email]
  );

  r.rowCount
    ? res.json({ message: "Deleted" })
    : res.status(404).json({ message: "Not found" });
});

/* ========================= PROFILE ========================= */

// 🔹 Edit Profile (SAFE for 3 DB)
app.put("/editprofile", async (req, res) => {
  try {
    const { email, username, password, bio, avatar } = req.body;
    const hash = await bcrypt.hash(password, 10);

    const u = await usersDB.query(
      `UPDATE users SET username=$1,password=$2,bio=$3,avatar=$4
       WHERE email=$5`,
      [username, hash, bio, avatar, email]
    );

    if (!u.rowCount)
      return res.status(404).json({ message: "User not found" });

    await postsDB.query(
      "UPDATE posts SET username=$1,avatar=$2 WHERE email=$3",
      [username, avatar, email]
    );

    res.json({ message: "Profile updated" });
  } catch {
    res.status(500).json({ message: "Update failed" });
  }
});

// 🔹 Delete User
app.delete("/deleteuser/:email", async (req, res) => {
  const { email } = req.params;
  await postsDB.query("DELETE FROM posts WHERE email=$1", [email]);
  const r = await usersDB.query("DELETE FROM users WHERE email=$1", [email]);

  r.rowCount
    ? res.json({ message: "User deleted" })
    : res.status(404).json({ message: "User not found" });
});

/* ========================= REACTIONS ========================= */

app.post("/react", async (req, res) => {
  const { postId, email, reaction } = req.body;
  await interactDB.query(
    "INSERT INTO likes (post_id,email,reaction) VALUES ($1,$2,$3)",
    [postId, email, reaction]
  );
  res.json({ message: "Reaction saved" });
});

app.get("/QuanOfReact", async (req, res) => {
  const { postId } = req.query;

  const likes = await interactDB.query(
    "SELECT COUNT(*) FROM likes WHERE post_id=$1",
    [postId]
  );

  const comments = await interactDB.query(
    "SELECT COUNT(*) FROM comments WHERE post_id=$1",
    [postId]
  );

  res.json({
    likes: Number(likes.rows[0].count),
    comments: Number(comments.rows[0].count),
  });
});

/* ========================= MISC ========================= */

app.get("/", (_, res) => res.json({ message: "Backend running ✅" }));

// 🔹 Start
const PORT = process.env.PORT || 5000;
(async () => {
  await initDB();
  app.listen(PORT, () =>
    console.log(`🚀 Server running on port ${PORT}`)
  );
})();
