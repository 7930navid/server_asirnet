const express = require("express");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 4000;

/* 🔹 Target servers (UPDATED) */
const TARGET_SERVERS = [
  "https://users-server-xyvg.onrender.com/",
  "https://posts-server-plog.onrender.com/",
  "https://interacts-server.onrender.com/"
];

/* 🔹 Ping function */
async function pingServers() {
  const time = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
  console.log(`🔄 Ping started at ${time}`);

  for (const url of TARGET_SERVERS) {
    try {
      const res = await fetch(url);
      console.log(`✅ ${url} → ${res.status}`);
    } catch (err) {
      console.error(`❌ ${url} → FAILED`, err.message);
    }
  }

  console.log("✅ Ping cycle finished\n");
}

/* 🔹 Ping every 5 minutes */
const INTERVAL = 1000 * 60 * 5;
setInterval(pingServers, INTERVAL);

/* 🔹 First ping immediately */
pingServers();

/* 🔹 Health route */
app.get("/", (req, res) => {
  res.send("🟢 Ping Server is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Ping Server running on port ${PORT}`);
});