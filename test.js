const Anthropic = require("@anthropic-ai/sdk");
const API_KEY = "YOUR_KEY_HERE
const client = new Anthropic({ apiKey: API_KEY });
const SYSTEM_PROMPT = "You are the friendly AI receptionist for Apex Plumbing. Keep replies short under 40 words. Never give price quotes. For emergencies say someone will call back within 5 minutes.";
const conversation = [];
async function chat(msg) {
  conversation.push({ role: "user", content: msg });
  const r = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 150, system: SYSTEM_PROMPT, messages: conversation });
  const reply = r.content[0].text;
  conversation.push({ role: "assistant", content: reply });
  return reply;
}
async function main() {
  const calls = ["Hi I have a burst pipe!", "My name is John at 42 Oak Street", "My number is 07700 900123"];
  for (const m of calls) { console.log("CALLER: " + m); console.log("AI: " + await chat(m) + "\n"); }
}
main();