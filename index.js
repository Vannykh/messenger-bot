const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

// ===== បញ្ចូល Keys របស់អ្នកនៅទីនេះ =====
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_verify_token_123";
// ==========================================

// System prompt — ប្រាប់ Claude ថាជា Bot លក់ទំនិញ
const SYSTEM_PROMPT = `អ្នកជាភ្នាក់ងារតបឆាតសម្រាប់ហាង Facebook។ 
ឈ្មោះអ្នកគឺ "Bot ជំនួយការ"។
សូមឆ្លើយជាភាសាខ្មែរ ឬភាសាដែលភ្ញៀវប្រើ។
អ្នកជួយភ្ញៀវអំពី: ទំនិញ, តម្លៃ, ការបញ្ជាទិញ, និងព័ត៌មានហាង។
ឆ្លើយខ្លី ច្បាស់ និងរួសរាយ។
បញ្ចប់ message ជាមួយ emoji សមរម្យ។`;

// រក្សា conversation history
const conversations = {};

// Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ទទួល Messages
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
      const senderId = event.sender.id;

      if (event.message && event.message.text) {
        const userMessage = event.message.text;
        console.log(`📩 Message from ${senderId}: ${userMessage}`);

        try {
          // ទទួល reply ពី Claude
          const reply = await getClaudeReply(senderId, userMessage);
          // ផ្ញើ reply ទៅ Messenger
          await sendMessage(senderId, reply);
        } catch (err) {
          console.error("❌ Error:", err.message);
          await sendMessage(senderId, "សុំទោស! មានបញ្ហាបច្ចេកទេស សូមព្យាយាមម្តងទៀត 🙏");
        }
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// សុំ Claude ឆ្លើយ
async function getClaudeReply(userId, userMessage) {
  // រក្សា history រហូតដល់ 10 messages
  if (!conversations[userId]) conversations[userId] = [];
  conversations[userId].push({ role: "user", content: userMessage });
  if (conversations[userId].length > 20) {
    conversations[userId] = conversations[userId].slice(-20);
  }

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: conversations[userId],
    },
    {
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  const reply = response.data.content[0].text;
  conversations[userId].push({ role: "assistant", content: reply });
  return reply;
}

// ផ្ញើ Message ទៅ Messenger
async function sendMessage(recipientId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: recipientId },
      message: { text },
    }
  );
  console.log(`✅ Sent reply to ${recipientId}`);
}

// Health check
app.get("/", (req, res) => res.send("🤖 Bot is running!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
