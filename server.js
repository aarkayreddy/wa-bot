const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// Create a new WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth()
});

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

app.use((req, res, next) => {
    console.log(`Received request at: ${req.url}`);
    next();
});

let qrCodeData = null;

client.on("qr", (qr) => {
    qrCodeData = qr; // Store the QR code
    console.log("Scan this QR Code to log in.");
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
});

client.on("authenticated", () => {
    console.log("Authenticated with WhatsApp!");
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.initialize();

// Endpoint to get QR Code
app.get("/qr", async (req, res) => {
    if (!qrCodeData) {
        return res.send("QR Code not available yet.");
    }
    const qrImage = await qrcode.toDataURL(qrCodeData);
    res.send(`<img src="${qrImage}" />`);
});

// Endpoint to get contacts
app.get("/contacts", async (req, res) => {
    try {
        const contacts = await client.getContacts();
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch contacts" });
    }
});


// API endpoint to send a message
app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: 'Please provide both number and message' });
    }

    try {
        const chatId = `${number}@c.us`;
        await client.sendMessage(chatId, message);
        res.status(200).json({ success: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// API endpoint to get messages from a chat
app.get('/get-messages/:number', async (req, res) => {
    const number = req.params.number;

    if (!number) {
        return res.status(400).json({ error: 'Please provide a number' });
    }

    try {
        const chatId = `${number}@c.us`;
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 10 });

        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

const convertToIST = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return date.toLocaleString('en-IN', options);
};

// api to get all conversations
app.get('/get-conversations', async (req, res) => {
    try {
        const chats = await client.getChats();
        const conversations = [];

        for (const chat of chats) {
            const messages = await chat.fetchMessages({ limit: 50 });
            const conversation = {
                chatId: chat.id._serialized,
                contact: {},
                messages: [],
            };

            for (const msg of messages) {
                const toNumber = msg.to ? msg.to.split('@')[0] : 'unknown';

                if (!conversation.contact[toNumber]) {
                    try {
                        const contact = await client.getContactById(msg.to);
                        conversation.contact[toNumber] = {
                            id: contact.id._serialized,
                            name: contact.pushname || contact.name || 'Unknown',
                            number: toNumber
                        };
                    } catch (contactError) {
                        console.error('Failed to get contact info:', contactError);
                    }
                }

                // Convert timestamp to IST
                const formattedDate = convertToIST(msg.timestamp);

                conversation.messages.push({
                    id: msg.id._serialized,
                    from: msg.from,
                    to: msg.to,
                    body: msg.body,
                    dateTime: formattedDate,
                });
            }

            conversations.push(conversation);
        }

        res.status(200).json(conversations);
    } catch (error) {
        console.error('Failed to get conversations:', error);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
