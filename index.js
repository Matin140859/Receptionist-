const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");
const https = require("https");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("OK"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const BUSINESSES = {
  "+12763294723": {
    name: "Facility Fix 24",
    ownerPhone: "+4915731311709",
    twilioNumber: "+12763294723",
    greeting: "Hallo und herzlich willkommen bei Facility Fix 24, Ihrem Klempner-Notdienst in Berlin! Ich bin Ihr persoenlicher KI-Assistent. Wie heissen Sie und wie darf ich Ihnen helfen?",
    prompt: "Du bist der KI-Rezeptionist von Facility Fix 24, einem professionellen Klempner-Betrieb in Berlin."
  }
};

const BASE_PROMPT = " Antworte IMMER auf Deutsch. Maximal 20 Woerter pro Antwort. Stelle immer nur EINE Frage auf einmal. Schritt 1: Frage nach Name und Anliegen. Schritt 2: Sobald du Name und Anliegen hast, sage: Vielen Dank, ich habe Ihr Anliegen notiert. Damit wir Sie so schnell wie moeglich zurueckrufen koennen, brauche ich noch Ihre Rueckrufnummer. Schritt 3: Hoere der Nummer SEHR genau zu. Wiederhole JEDE einzelne Ziffer langsam und deutlich mit Pause dazwischen. Benutze NIEMALS Ordinalzahlen. Wenn der Anrufer eine Korrektur macht, wiederhole die gesamte Nummer nochmal. Schritt 4: Erst wenn bestaetigt, sage: Vielen Dank! Wir melden uns so schnell wie moeglich. Auf Wiedersehen! Keine Preisangebote.";

const conversations = {};

app.post("/voice", async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const calledNumber = req.body.To;
    const business = BUSINESSES[calledNumber] || BUSINESSES["+12763294723"];
    if (!conversations[callSid]) conversations[callSid] = { messages: [], business };
    const userSpeech = req.body.SpeechResult;
    if (!userSpeech) await new Promise(resolve => setTimeout(resolve, 3000));
    let replyText = business.greeting;
    if (userSpeech) {
      conversations[callSid].messages.push({ role: "user", content: userSpeech });
      const response = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 150, system: business.prompt + BASE_PROMPT, messages: conversations[callSid].messages });
      replyText = response.content[0].text;
      replyText = replyText.replace(/&/g, "und").replace(/</g, "").replace(/>/g, "");
      conversations[callSid].messages.push({ role: "assistant", content: replyText });
    }
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Vicki" language="de-DE">' + replyText + '</Say><Gather input="speech" timeout="15" speechTimeout="2" language="de-DE" action="/voice" method="POST"><Say voice="Polly.Vicki"> </Say></Gather><Redirect>/voice</Redirect></Response>');
  } catch (err) {
    console.error("Voice error:", err.message, err.stack);
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Vicki" language="de-DE">Es tut mir leid, ein Fehler ist aufgetreten. Bitte rufen Sie spaeter an.</Say></Response>');
  }
});

app.post("/status", async (req, res) => {
  console.log("Status called:", req.body.CallStatus, req.body.CallSid);
  try {
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;
    if (callStatus === "completed" && conversations[callSid] && conversations[callSid].messages.length > 0) {
      const business = conversations[callSid].business;
      const transcript = conversations[callSid].messages.map(m => m.role.toUpperCase() + ": " + m.content).join("\n");
      const summary = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 200, messages: [{ role: "user", content: "Fasse dieses Gespraech kurz zusammen. Name, Problem, Rueckrufnummer:\n" + transcript }] });
      await twilioClient.messages.create({ body: "Neuer Anruf - " + business.name + ":\n" + summary.content[0].text, from: business.twilioNumber, to: business.ownerPhone });
      delete conversations[callSid];
    }
  } catch (err) {
    console.error("Status error:", err.message);
  }
  res.sendStatus(200);
});

setInterval(() => {
  https.get("https://receptionist-suce.onrender.com/");
}, 5 * 60 * 1000);

app.listen(process.env.PORT || 3000, "0.0.0.0", () => console.log("Server running"));