const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (option) => {
    await resend.emails.send({
        from: "Whisp <onboarding@resend.dev>",
        to: "aditya.developer2025@gmail.com",
        subject: option.subject,
        html: option.message,
    });
};

module.exports = sendEmail;
