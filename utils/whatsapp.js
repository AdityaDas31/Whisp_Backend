const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp Client is ready!");
});

client.initialize();

// Send WhatsApp message function
async function sendWhatsAppMessage(phoneNumber, message) {
  try {
    // phoneNumber should be in international format (without +) e.g. "919876543210"
    const chatId = `${phoneNumber}@c.us`;
    await client.sendMessage(chatId, message);
    console.log("Message sent to:", phoneNumber);
  } catch (err) {
    console.error("Error sending message:", err);
  }
}

module.exports = { sendWhatsAppMessage };
