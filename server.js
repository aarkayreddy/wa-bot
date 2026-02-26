const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");

const app = express();
const port = process.env.PORT || 3000;

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Basic Auth Protection (IMPORTANT) =====
const API_KEY = "YOUR_SECRET_KEY";

app.use((req, res, next) => {
  if (req.path === "/status" || req.path === "/qr") return next();

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// ===== WhatsApp Client =====
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

let qrCodeData = null;
let isClientReady = false;

client.on("qr", (qr) => {
  console.log("QR received");
  qrCodeData = qr;
});

client.on("ready", () => {
  console.log("WhatsApp client is ready!");
  isClientReady = true;
  qrCodeData = null;
});

client.on("auth_failure", (msg) => {
  console.error("Auth failure:", msg);
});

client.initialize();

// ======================================================
// ================= MOBILE API ENDPOINTS ===============
// ======================================================

// 1️⃣ Check WhatsApp Status
app.get("/status", (req, res) => {
  res.json({
    ready: isClientReady,
  });
});

// 2️⃣ Get QR Code (Base64 Image)
app.get("/qr", async (req, res) => {
  if (!qrCodeData) {
    return res.json({ qr: null });
  }

  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.json({ qr: qrImage });
});

// 3️⃣ Get Chats List
app.get("/chats", async (req, res) => {
  try {
    const chats = await client.getChats();

    const formattedChats = chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
    }));

    res.json(formattedChats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// 4️⃣ Get Messages of a Chat
app.get("/messages/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 30 });

    const formattedMessages = messages.map((msg) => ({
      id: msg.id._serialized,
      from: msg.from,
      fromMe: msg.fromMe,
      body: msg.body,
      timestamp: msg.timestamp,
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// 5️⃣ Send Message
app.post("/send", async (req, res) => {
  try {
    const { chatId, message } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({
        error: "chatId and message are required",
      });
    }

    await client.sendMessage(chatId, message);

    res.json({
      success: true,
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ===== Start Server =====
app.listen(port, () => {
  console.log(`WhatsApp API running on http://localhost:${port}`);
});
