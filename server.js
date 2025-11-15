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

// 🔹 Multi-DB connections
const usersDB = new Pool({
  connectionString: process.env.USERS_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const postsDB = new Pool({
  connectionString: process.env.POSTS_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const interactDB = new Pool({
  connectionString: process.env.INTERACT_DB_URL,
  ssl: { rejectUnauthorized: false },
});

// 🔹 Initialize tables
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

    console.log("✅ All tables initialized successfully!");
  } catch (err) {
    console.error("❌ Error initializing tables:", err.message);
  }
}

// 🔹 Signup
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, bio, avatar } = req.body;

    if (!username || !email || !password || !bio || !avatar)
      return res.status(400).json({ message: "Please fill all fields" });

    const exists = await usersDB.query("SELECT * FROM users WHERE email=$1", [email]);
    if (exists.rows.length > 0)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await usersDB.query(
      "INSERT INTO users (username, email, password, bio, avatar) VALUES ($1, $2, $3, $4, $5)",
      [username, email, hashedPassword, bio, avatar]
    );

    res.json({ message: "Registered successfully" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Error registering user", error: err.message });
  }
});

// 🔹 Signin
app.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Please fill all fields" });

    const result = await usersDB.query("SELECT * FROM users WHERE email=$1", [email]);
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

    const u = await usersDB.query("SELECT * FROM users WHERE username=$1", [user]);
    if (u.rows.length === 0)
      return res.status(400).json({ message: "User not found" });

    await postsDB.query(
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
    const posts = await postsDB.query("SELECT * FROM posts ORDER BY id DESC");
    res.json(posts.rows);
  } catch (err) {
    res.status(500).json({ message: "Error fetching posts", error: err.message });
  }
});

// 🔹 Edit Post by ID + Email
app.put("/post/:email/:id", async (req, res) => {
  try {
    const { email, id } = req.params;
    const { text } = req.body;

    const result = await postsDB.query(
      "UPDATE posts SET text=$1 WHERE id=$2 AND email=$3 RETURNING *",
      [text, id, email]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ message: "Post not found or unauthorized" });

    res.json({ message: "Post updated successfully", post: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: "Error updating post", error: err.message });
  }
});

// 🔹 Delete Post
app.delete("/post/:email/:id", async (req, res) => {
  try {
    const { email, id } = req.params;

    const result = await postsDB.query("DELETE FROM posts WHERE id=$1 AND email=$2", [id, email]);

    if (result.rowCount > 0) {
      res.json({ message: "Post deleted successfully" });
    } else {
      res.status(404).json({ message: "Post not found or unauthorized" });
    }

  } catch (err) {
    res.status(500).json({ message: "Error deleting post", error: err.message });
  }
});

// 🔹 Edit Profile
app.put("/editprofile", async (req, res) => {
  try {
    const { email, username, password, bio, avatar } = req.body;

    if (!email || !username || !password || !bio || !avatar)
      return res.status(400).json({ message: "Please fill all fields" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const client = await usersDB.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        `UPDATE users 
         SET username=$1, password=$2, bio=$3, avatar=$4 
         WHERE email=$5 
         RETURNING *`,
        [username, hashedPassword, bio, avatar, email]
      );

      if (userResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "User not found" });
      }

      await postsDB.query(
        `UPDATE posts SET username=$1, avatar=$2 WHERE email=$3`,
        [username, avatar, email]
      );

      await client.query("COMMIT");

      res.json({
        message: "Profile and posts updated successfully",
        user: userResult.rows[0]
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ message: "Error updating profile", error: err.message });
  }
});

// 🔹 Delete User + Posts
app.delete("/deleteuser/:email", async (req, res) => {
  try {
    const { email } = req.params;
    await postsDB.query("DELETE FROM posts WHERE email=$1", [email]);
    const result = await usersDB.query("DELETE FROM users WHERE email=$1", [email]);

    if (result.rowCount > 0)
      res.json({ message: `${email} has been deleted` });
    else
      res.status(404).json({ message: "User not found" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user", error: err.message });
  }
});

// 🔹 Fetch all users
app.get("/users", async (req, res) => {
  try {
    const users = await usersDB.query("SELECT * FROM users");
    res.json(users.rows.map(u => ({ ...u, password: undefined })));
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err.message });
  }
});

// 🔹 Add Reaction / Like
app.post("/react", async (req, res) => {
  try {
    const { postId, email, reaction } = req.body;

    if (!postId || !email || !reaction) {
      return res.status(400).json({ message: "Post ID, email and reaction must be required! " });
    }

    // Reaction save করা
    const result = await interactDB.query(
      "INSERT INTO likes (post_id, email) VALUES ($1, $2) RETURNING *",
      [postId, email]
    );


    res.json({ message: "Reaction saved ", data: result.rows[0] });
  } catch (err) {
    console.error("Error saving reaction:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
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