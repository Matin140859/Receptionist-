const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("OK"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = "Du bist der freundliche KI-Rezeptionist von Apex Plumbing. Antworte IMMER auf Deutsch. Halte Antworten kurz unter 30 Woerter. Erfasse den Namen, das Problem und die Rueckrufnummer des Anrufers. Gib niemals Preisangebote.";

const conversations = {};

app.post("/voice", async (req, res) => {
  const callSid = req.body.CallSid;
  if (!conversations[callSid]) conversations[callSid] = [];
  const userSpeech = req.body.SpeechResult;
  let replyText = "Willkommen bei Apex Plumbing! Wie kann ich Ihnen helfen?";
  if (userSpeech) {
    conversations[callSid].push({ role: "user", content: userSpeech });
    const response = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 150, system: SYSTEM_PROMPT, messages: conversations[callSid] });
    replyText = response.content[0].text;
    conversations[callSid].push({ role: "assistant", content: replyText });
  }
  res.type("text/xml");
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Marlene">' + replyText + '</Say><Gather input="speech" timeout="5" action="/voice" method="POST"><Say voice="Polly.Marlene"> </Say></Gather></Response>');
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Server running"));