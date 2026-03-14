const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(express.urlencoded({ extended: true }));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the friendly AI receptionist for Apex Plumbing. Keep replies short (under 30 words) — this is a phone call. Your job: understand the caller's problem, how urgent it is, and get their name and callback number. Never give price quotes. For emergencies say someone will call back within 5 minutes.`;

const conversations = {};

app.post("/voice", async (req, res) => {
  const callSid = req.body.CallSid;
  if (!conversations[callSid]) conversations[callSid] = [];

  const userSpeech = req.body.SpeechResult;

  let replyText = "Thanks for calling Apex Plumbing! How can I help you today?";

  if (userSpeech) {
    conversations[callSid].push({ role: "user", content: userSpeech });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: conversations[callSid],
    });
    replyText = response.content[0].text;
    conversations[callSid].push({ role: "assistant", content: replyText });
  }

  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${replyText}</Say>
  <Gather input="speech" timeout="5" action="/voice" method="POST">
    <Say voice="Polly.Amy"> </Say>
  </Gather>
</Response>`);
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log("Server running"));