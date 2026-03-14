const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("OK"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const SYSTEM_PROMPT = "Du bist der freundliche KI-Rezeptionist von Apex Plumbing. Antworte IMMER auf Deutsch. Halte Antworten kurz unter 30 Woerter. Frage nur nach Informationen die du noch nicht hast. Erfasse: 1) Name des Anrufers 2) Problem 3) Rueckrufnummer. Wenn du alle drei hast, bedanke dich und beende das Gespraech. Gib niemals Preisangebote.";

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
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Marlene">' + replyText + '</Say><Gather input="speech" timeout="10" speechTimeout="auto" language="de-DE" action="/voice" method="POST"><Say voice="Polly.Marlene"> </Say></Gather><Redirect>/voice</Redirect></Response>');
});

app.post("/status", async (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  if (callStatus === "completed" && conversations[callSid] && conversations[callSid].length > 0) {
    const transcript = conversations[callSid].map(m => m.role.toUpperCase() + ": " + m.content).join("\n");
    const summary = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{ role: "user", content: "Fasse dieses Gespraech in 3 Zeilen zusammen. Name, Problem, Rueckrufnummer:\n" + transcript }]
    });
    await twilioClient.messages.create({
      body: "Neuer Anruf - Apex Plumbing:\n" + summary.content[0].text,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.OWNER_PHONE
    });
    delete conversations[callSid];
  }
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Server running"));