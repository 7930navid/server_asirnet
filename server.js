const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

/**
 * Render/railway/vercel style: platform দেয় PORT env var.
 * লোকালি চালালে 3000, Render-এ স্বয়ংক্রিয়ভাবে their PORT (log-এ 10000 দেখা যায়)।
 */
const PORT = process.env.PORT || 3000;

/**
 * JWT secret অবশ্যই সেট করবে env-এ:
 *   JWT_SECRET=mysecretkey
 * dev/test-এ fallback রাখা হলো যেন লোকালি রান হয়।
 */
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";

/** Core middlewares */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/** In-memory "DB" (server restart হলে ডেটা মুছে যাবে) */
let users = []; // { id, username, password }
let posts = []; // { id, userId, username, content }

/** Helper: uniform JSON error */
function sendError(res, code, message) {
  return res.status(code).json({ error: message });
}

/** Auth middleware */
function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return sendError(res, 401, "No token provided");

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return sendError(res, 403, "Invalid or expired token");
    req.user = payload; // { id, username }
    next();
  });
}

/** Health / root (frontend ‘/’ এ হিট করলে JSON পাওয়া যাবে) */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "asirnet-backend",
    users: users.length,
    posts: posts.length,
  });
});

/** ---------- Auth ---------- */

/** Register */
app.post("/register", (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return sendError(res, 400, "Provide username & password");

    const exists = users.find((u) => u.username === username);
    if (exists) return sendError(res, 400, "User exists");

    const id = Date.now().toString();
    users.push({ id, username, password });
    res.json({ message: "Registered!" });
  } catch (e) {
    console.error("Register error:", e);
    sendError(res, 500, "Server error");
  }
});

/** Login */
app.post("/login", (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return sendError(res, 400, "Provide username & password");

    const user = users.find(
      (u) => u.username === username && u.password === password
    );
    if (!user)
      return sendError(
        res,
        400,
        "Invalid credentials: No such account or wrong password"
      );

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (e) {
    console.error("Login error:", e);
    sendError(res, 500, "Server error");
  }
});

/** Current user */
app.get("/me", verifyToken, (req, res) => {
  const me = users.find((u) => u.id === req.user.id);
  if (!me) return sendError(res, 404, "User not found");
  res.json({ id: me.id, username: me.username });
});

/** ---------- Users (safe) ---------- */

/** List all users (safe) */
app.get("/users", (req, res) => {
  const safe = users.map((u) => ({ id: u.id, username: u.username }));
  res.json(safe);
});

/** Update my account */
app.put("/users/:id", verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.user.id) return sendError(res, 403, "Forbidden");

    const me = users.find((u) => u.id === id);
    if (!me) return sendError(res, 404, "User not found");

    const { username, password } = req.body || {};
    if (username) me.username = username;
    if (password) me.password = password;

    res.json({ message: "Your account updated" });
  } catch (e) {
    console.error("Update user error:", e);
    sendError(res, 500, "Server error");
  }
});

/** Delete my account */
app.delete("/users/:id", verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    if (id !== req.user.id) return sendError(res, 403, "Forbidden");

    users = users.filter((u) => u.id !== id);
    posts = posts.filter((p) => p.userId !== id);
    res.json({ message: "Deleted" });
  } catch (e) {
    console.error("Delete user error:", e);
    sendError(res, 500, "Server error");
  }
});

/** ---------- Posts ---------- */

/** Get all posts (public) */
app.get("/posts", (req, res) => {
  res.json(posts);
});

/** Create post (auth) */
app.post("/posts", verifyToken, (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content) return sendError(res, 400, "No content");

    const post = {
      id: Date.now().toString(),
      userId: req.user.id,
      username: req.user.username,
      content,
    };
    posts.push(post);
    res.json(post);
  } catch (e) {
    console.error("Create post error:", e);
    sendError(res, 500, "Server error");
  }
});

/** Update my post */
app.put("/posts/:id", verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const post = posts.find((p) => p.id === id);
    if (!post) return sendError(res, 404, "Post not found");
    if (post.userId !== req.user.id) return sendError(res, 403, "Forbidden");

    const { content } = req.body || {};
    if (content) post.content = content;

    res.json(post);
  } catch (e) {
    console.error("Update post error:", e);
    sendError(res, 500, "Server error");
  }
});

/** Delete my post */
app.delete("/posts/:id", verifyToken, (req, res) => {
  try {
    const { id } = req.params;
    const post = posts.find((p) => p.id === id);
    if (!post) return sendError(res, 404, "Post not found");
    if (post.userId !== req.user.id) return sendError(res, 403, "Forbidden");

    posts = posts.filter((p) => p.id !== id);
    res.json({ message: "Post deleted" });
  } catch (e) {
    console.error("Delete post error:", e);
    sendError(res, 500, "Server error");
  }
});

/** 404 handler (JSON) */
app.use((req, res) => sendError(res, 404, "Route not found"));

/** Global error handler (JSON) */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  sendError(res, 500, "Server error");
});

/** Start server */
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
