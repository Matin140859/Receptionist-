const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: true }));
app.post("/voice", (req, res) => {
  res.type("text/xml");
  res.send(`<Response><Say voice="Polly.Amy">Hello! You have reached the AI receptionist. This is a test!</Say></Response>`);
});
app.listen(3000, () => console.log("Server running on port 3000"));
