const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: false,
        auth: {
            user: process.env.SMTP_MAIL,      // "apikey"
            pass: process.env.SMTP_PASSWORD,  // Brevo key
        },
        connectionTimeout: 10000,
    });

    await transporter.verify(); // will fail loudly if wrong

    await transporter.sendMail({
        from: `"Whisp" <no-reply@whisp.app>`, // can be anything initially
        to: options.email,
        subject: options.subject,
        html: options.message,
    });
};

module.exports = sendEmail;
