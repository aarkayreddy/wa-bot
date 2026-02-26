const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");

const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

app.use(express.json());

let qrCodeData = null;
let isClientReady = false;

// When QR is generated
client.on("qr", async (qr) => {
  console.log("QR received");
  qrCodeData = qr;
});

// When authenticated
client.on("authenticated", () => {
  console.log("Authenticated");
});

// When ready
client.on("ready", () => {
  console.log("WhatsApp client is ready!");
  isClientReady = true;
  qrCodeData = null; // remove QR after login
});

client.on("auth_failure", (msg) => {
  console.error("Auth failure:", msg);
});

client.initialize();

// ================= FRONTEND PAGE =================
app.get("/", async (req, res) => {
  res.send(`
    <html>
    <head>
      <title>WhatsApp Bot</title>
      <script>
        async function checkStatus() {
          const res = await fetch('/status');
          const data = await res.json();

          if (!data.ready) {
            const qrRes = await fetch('/qr');
            const qrData = await qrRes.json();

            if (qrData.qr) {
              document.getElementById("content").innerHTML =
                "<h2>Scan QR Code</h2><img src='" + qrData.qr + "' />";
            }
          } else {
            const convRes = await fetch('/conversations');
            const conversations = await convRes.json();

            let html = "<h2>Connected ✅</h2>";
            html += "<h3>Conversations</h3><ul>";

            conversations.forEach(chat => {
              html += "<li>" + chat.name + " (" + chat.id + ")</li>";
            });

            html += "</ul>";
            document.getElementById("content").innerHTML = html;
          }
        }

        setInterval(checkStatus, 3000);
        window.onload = checkStatus;
      </script>
    </head>
    <body>
      <div id="content">
        <h2>Loading...</h2>
      </div>
    </body>
    </html>
  `);
});

// ================= API ENDPOINTS =================

// Return QR image
app.get("/qr", async (req, res) => {
  if (!qrCodeData) {
    return res.json({ qr: null });
  }

  const qrImage = await qrcode.toDataURL(qrCodeData);
  res.json({ qr: qrImage });
});

// Return connection status
app.get("/status", (req, res) => {
  res.json({ ready: isClientReady });
});

// Return conversations
app.get("/conversations", async (req, res) => {
  try {
    const chats = await client.getChats();

    const formattedChats = chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
    }));

    res.json(formattedChats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// API endpoint to send a message
app.post("/send-message", async (req, res) => {
  const { numbers, message } = req.body.numbers;

  if (!numbers || !Array.isArray(numbers)) {
    return res.status(400).json({
      error: "Please provide numbers array",
    });
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    for (let i = 0; i < numbers.length; i++) {
      const number = numbers[i];
      const chatId = `${number}@c.us`;

      await client.sendMessage(chatId, message);
      console.log(`Message sent to ${number}`);

      // Wait 1 minute before next message
      if (i < numbers.length - 1) {
        console.log("Waiting 10 seconds...");
        await delay(10000); // 10000 ms = 10 seconds
      }
    }

    res.status(200).json({
      success: "All messages sent with 10 seconds delay",
    });
  } catch (error) {
    console.error("Error sending messages:", error);
    res.status(500).json({ error: "Failed to send messages" });
  }
});

// API endpoint to get messages from a chat
app.get("/get-messages/:number", async (req, res) => {
  const number = req.params.number;
  if (!number) {
    return res.status(400).json({ error: "Please provide a number" });
  }
  try {
    const chatId = `${number}@c.us`;
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 10 });
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
