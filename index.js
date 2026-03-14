const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const twilio = require("twilio");
const https = require("https");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => res.send("OK"));

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const SYSTEM_PROMPT = "Du bist der KI-Rezeptionist von Apex Plumbing. Antworte IMMER auf Deutsch. Maximal 20 Woerter pro Antwort. Stelle immer nur EINE Frage auf einmal. Schritt 1: Frage nach Name und Anliegen. Schritt 2: Sobald du Name und Anliegen hast, sage: Vielen Dank, ich habe Ihr Anliegen notiert. Damit wir Sie so schnell wie moeglich zurueckrufen koennen, brauche ich noch Ihre Rueckrufnummer. Schritt 3: Hoere der Nummer SEHR genau zu. Wiederhole JEDE einzelne Ziffer langsam und deutlich mit Pause dazwischen. Wenn du dir bei einer Ziffer nicht sicher bist, frage nochmal nach. Beispiel: null, eins, sieben, drei, vier, fuenf, sechs, ist das korrekt? Benutze NIEMALS Ordinalzahlen. Wenn der Anrufer eine Korrektur macht, wiederhole die gesamte Nummer nochmal von Anfang an. Schritt 4: Erst wenn der Anrufer die Nummer ausdruecklich bestaetigt, sage: Vielen Dank! Wir melden uns so schnell wie moeglich bei Ihnen. Auf Wiedersehen! Keine Preisangebote.";

const conversations = {};

async function textToSpeech(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text: text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    });
    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg"
      }
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const audioCache = {};

app.get("/audio/:callSid", (req, res) => {
  const audio = audioCache[req.params.callSid];
  if (!audio) return res.status(404).send("Not found");
  res.set("Content-Type", "audio/mpeg");
  res.send(Buffer.from(audio, "base64"));
  delete audioCache[req.params.callSid];
});

app.post("/voice", async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    if (!conversations[callSid]) conversations[callSid] = [];
    const userSpeech = req.body.SpeechResult;
    if (!userSpeech) await new Promise(resolve => setTimeout(resolve, 3000));
    let replyText = "Hallo und herzlich willkommen bei Apex Plumbing! Wie heissen Sie und was koennen wir fuer Sie tun?";
    if (userSpeech) {
      conversations[callSid].push({ role: "user", content: userSpeech });
      const response = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 150, system: SYSTEM_PROMPT, messages: conversations[callSid] });
      replyText = response.content[0].text;
      replyText = replyText.replace(/&/g, "und").replace(/</g, "").replace(/>/g, "");
      conversations[callSid].push({ role: "assistant", content: replyText });
    }
    const audio = await textToSpeech(replyText);
    audioCache[callSid] = audio;
    const host = req.headers.host;
    res.type("text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>https://${host}/audio/${callSid}</Play><Gather input="speech" timeout="15" speechTimeout="2" language="de-DE" action="/voice" method="POST"><Say> </Say></Gather><Redirect>/voice</Redirect></Response>`);
  } catch (err) {
    console.error("Voice error:", err.message, err.stack);
    res.type("text/xml");
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say language="de-DE">Es tut mir leid, ein Fehler ist aufgetreten. Bitte rufen Sie spaeter an.</Say></Response>');
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