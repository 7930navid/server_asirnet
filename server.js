const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: "https://7930navid.github.io"
}));

// 🔹 PostgreSQL connection (Render DATABASE_URL ব্যবহার করবে)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render এ SSL দরকার
});

// 🔹 টেবিল বানানো (প্রথম deploy এ run হবে)
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      bio TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL,
      text TEXT NOT NULL
    )
  `);
}

// 🔹 Register
app.post("/signup", async (req, res) => {
  const { username, email, password, bio } = req.body;
  if (!username || !email || !password || !bio)
    return res.status(400).json({ message: "Please fill all fields" });

  try {
    const exists = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (exists.rows.length > 0)
      return res.status(400).json({ message: "User already exists" });

    await pool.query(
      "INSERT INTO users (username, email, password, bio) VALUES ($1, $2, $3, $4)",
      [username, email, password, bio]
    );
    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error registering user", error: err.message });
  }
});

// 🔹 Login
app.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Please fill all fields" });

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1 AND password=$2",
      [email, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid email or password" });

    res.json({ message: "Login successful", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error logging in", error: err.message });
  }
});

// 🔹 Create Post
app.post("/post", async (req, res) => {
  const { user, text } = req.body;
  if (!text) return res.status(400).json({ message: "Please write a post first" });

  try {
    const u = await pool.query("SELECT * FROM users WHERE username=$1", [user]);
    if (u.rows.length === 0) return res.status(400).json({ message: "User not found" });

    await pool.query("INSERT INTO posts (username, email, text) VALUES ($1, $2, $3)", [
      u.rows[0].username,
      u.rows[0].email,
      text,
    ]);
    res.json({ message: "Post Created" });
  } catch (err) {
    res.status(500).json({ message: "Error creating post", error: err.message });
  }
});

// 🔹 Get all posts
app.get("/post", async (req, res) => {
  try {
    const posts = await pool.query("SELECT * FROM posts ORDER BY id DESC");
    res.json(posts.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching posts", error: err.message });
  }
});

// 🔹 Edit Profile
app.put("/editprofile", async (req, res) => {
  const { email, username, password, bio } = req.body;
  if (!email || !username || !password || !bio)
    return res.status(400).json({ message: "Please fill all fields" });

  try {
    const result = await pool.query(
      "UPDATE users SET username=$1, password=$2, bio=$3 WHERE email=$4 RETURNING *",
      [username, password, bio, email]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

// 🔹 Delete User + posts
app.delete("/deleteuser/:email", async (req, res) => {
  const { email } = req.params;
  try {
    await pool.query("DELETE FROM posts WHERE email=$1", [email]);
    const result = await pool.query("DELETE FROM users WHERE email=$1", [email]);

    if (result.rowCount > 0) res.json({ message: `${email} has been deleted` });
    else res.status(404).json({ message: "User not found" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user", error: err.message });
  }
});

// 🔹 Fetch all users
app.get("/users", async (req, res) => {
  try {
    const users = await pool.query("SELECT * FROM users");
    res.json(users.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err.message });
  }
});

// 🔹 Delete Post
app.delete("/post/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM posts WHERE id=$1", [id]);
    if (result.rowCount > 0) res.json({ message: "Post deleted successfully" });
    else res.status(404).json({ message: "Post not found" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting post", error: err.message });
  }
});

// 🔹 Edit Post
app.put("/post/:id", async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  try {
    const result = await pool.query("UPDATE posts SET text=$1 WHERE id=$2 RETURNING *", [text, id]);
    if (result.rowCount === 0) return res.status(404).json({ message: "Post not found" });

    res.json({ message: "Post updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error updating post", error: err.message });
  }
});
// 🔹 Server connection check
app.get('/connect', (req,res) => {
        res.send('Connected to server successfully!');
});

// 🔹 Start Server
const PORT = process.env.PORT || 5000;

async function startServer() {
  await initDB(); // PostgreSQL টেবিল create
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}
app.get("/", (req, res) => {
  res.json({ message: "Backend is working ✅" });
});

startServer();
