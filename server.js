const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");

const app = express();
app.use(helmet()); // basic security headers
app.use(bodyParser.json());

// ✅ CORS configuration
app.use(
  cors({
    origin: ["https://7930navid.github.io", "http://localhost:8080"],
  })
);

// 🔹 PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render এর জন্য SSL
});

// 🔹 Initialize DB
async function initDB() {
await pool.query(`
  DROP TABLE IF EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    bio TEXT,
    avatar TEXT
  );
`);

  await pool.query(`
    DROP TABLE IF EXISTS posts (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      avatar TEXT,
      email TEXT NOT NULL,
      text TEXT NOT NULL
    );
  `);
}

// 🔹 Signup
app.post("/signup", async (req, res) => {
  try {
    console.log("Signup request body:", req.body); // 🔹 Debug: দেখাবে কি আসছে
    const { username, email, password, bio, avatar } = req.body;

    // Input validation
    if (!username || !email || !password || !bio || !avatar) {
      return res.status(400).json({ message: "Please fill all fields" });
    }

    // Check if user already exists
    const exists = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Password hashing (bcryptjs recommended for compatibility)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into DB
    await pool.query(
      "INSERT INTO users (username, email, password, bio, avatar) VALUES ($1, $2, $3, $4, $5)",
      [username, email, hashedPassword, bio, avatar]
    );

    console.log(`User registered: ${email}`);
    res.json({ message: "Registered successfully" });

  } catch (err) {
    console.error("Signup error:", err); // 🔹 Debug: আসল error
    res.status(500).json({ message: "Error registering user", error: err.message });
  }
});
// 🔹 Signin
app.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Please fill all fields" });

    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid email or password" });

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid)
      return res.status(401).json({ message: "Invalid email or password" });

    res.json({ message: "Login successful", user: { ...user, password: undefined } });
  } catch (err) {
    res.status(500).json({ message: "Error logging in", error: err.message });
  }
});

// 🔹 Create Post
app.post("/post", async (req, res) => {
  try {
    const { user, text, avatar } = req.body;
    if (!text) return res.status(400).json({ message: "Please write a post first" });

    const u = await pool.query("SELECT * FROM users WHERE username=$1", [user]);
    if (u.rows.length === 0) return res.status(400).json({ message: "User not found" });

    await pool.query(
      "INSERT INTO posts (username, email, text, avatar) VALUES ($1, $2, $3, $4)",
      [u.rows[0].username, u.rows[0].email, text, avatar]
    );

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
  try {
    const { email, username, password, bio, avatar } = req.body;
    if (!email || !username || !password || !bio || !avatar)
      return res.status(400).json({ message: "Please fill all fields" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "UPDATE users SET username=$1, password=$2, bio=$3, avatar=$4 WHERE email=$5 RETURNING *",
      [username, hashedPassword, bio, avatar, email]
    );

    if (result.rowCount === 0) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Profile updated successfully", user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

// 🔹 Delete User + posts
app.delete("/deleteuser/:email", async (req, res) => {
  try {
    const { email } = req.params;
    await pool.query("DELETE FROM posts WHERE email=$1", [email]);
    const result = await pool.query("DELETE FROM users WHERE email=$1", [email]);

    if (result.rowCount > 0)
      res.json({ message: `${email} has been deleted` });
    else res.status(404).json({ message: "User not found" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user", error: err.message });
  }
});

// 🔹 Fetch all users
app.get("/users", async (req, res) => {
  try {
    const users = await pool.query("SELECT * FROM users");
    res.json(users.rows.map(u => ({ ...u, password: undefined }))); // hide passwords
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err.message });
  }
});

// 🔹 Delete Post by ID
app.delete("/post/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM posts WHERE id=$1", [id]);
    if (result.rowCount > 0) res.json({ message: "Post deleted successfully" });
    else res.status(404).json({ message: "Post not found" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting post", error: err.message });
  }
});

// 🔹 Edit Post by ID
app.put("/post/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    const result = await pool.query("UPDATE posts SET text=$1 WHERE id=$2 RETURNING *", [text, id]);
    if (result.rowCount === 0) return res.status(404).json({ message: "Post not found" });

    res.json({ message: "Post updated successfully", post: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error updating post", error: err.message });
  }
});

// 🔹 Server check
app.get("/", (req, res) => res.json({ message: "Backend is working ✅" }));

// 🔹 Start Server
const PORT = process.env.PORT || 5000;
async function startServer() {
  await initDB();
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
}
startServer();
