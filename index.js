const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("OK"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const SYSTEM_PROMPT = "Du bist der KI-Rezeptionist von Apex Plumbing. Antworte IMMER auf Deutsch. Maximal 20 Woerter pro Antwort. Stelle immer nur EINE Frage auf einmal. Wenn der Anrufer mehrere Informationen auf einmal gibt, nimm alle an ohne nachzufragen. Du brauchst: Name, Problem und Rueckrufnummer. Wenn der Anrufer die Rueckrufnummer nennt, wiederhole sie sehr langsam und deutlich, jede Ziffer einzeln mit 2 Sekunden Pause dazwischen, zum Beispiel: null, eins, sieben, drei, vier, fuenf, sechs, ist das korrekt? Benutze NIEMALS Ordinalzahlen. Erst wenn der Anrufer bestaetigt, sage: Vielen Dank! Wir melden uns so schnell wie moeglich. Auf Wiedersehen! Keine Preisangebote.";

const conversations = {};

app.post("/voice", async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    if (!conversations[callSid]) conversations[callSid] = [];
    const userSpeech = req.body.SpeechResult;
    if (!userSpeech) await new Promise(resolve => setTimeout(resolve, 3000));
    let replyText = "Hallo und herzlich willkommen bei Apex Plumbing! Bitte hinterlassen Sie Ihren Namen, Ihr Anliegen und Ihre Rueckrufnummer.";
    if (userSpeech) {
      conversations[callSid].push({ role: "user", content: userSpeech });
      const response = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 150, system: SYSTEM_PROMPT, messages: conversations[callSid] });
      replyText = response.content[0].text;
      replyText = replyText.replace(/&/g, "und").replace(/</g, "").replace(/>/g, "");
      conversations[callSid].push({ role: "assistant", content: replyText });
    }
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Vicki" language="de-DE">' + replyText + '</Say><Gather input="speech" timeout="15" speechTimeout="2" language="de-DE" action="/voice" method="POST"><Say voice="Polly.Vicki"> </Say></Gather><Redirect>/voice</Redirect></Response>');
  } catch (err) {
    console.error("Voice error:", err.message);
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Vicki" language="de-DE">Es tut mir leid, ein Fehler ist aufgetreten. Bitte rufen Sie spaeter an.</Say></Response>');
  }
});

app.post("/status", async (req, res) => {
  console.log("Status called:", req.body.CallStatus, req.body.CallSid);
  try {
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;
    if (callStatus === "completed" && conversations[callSid] && conversations[callSid].length > 0) {
      const transcript = conversations[callSid].map(m => m.role.toUpperCase() + ": " + m.content).join("\n");
      const summary = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 200, messages: [{ role: "user", content: "Fasse dieses Gespraech kurz zusammen. Name, Problem, Rueckrufnummer:\n" + transcript }] });
      await twilioClient.messages.create({ body: "Neuer Anruf - Apex Plumbing:\n" + summary.content[0].text, from: process.env.TWILIO_PHONE_NUMBER, to: process.env.OWNER_PHONE });
      delete conversations[callSid];
    }
  } catch (err) {
    console.error("Status error:", err.message);
  }
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Server running"));