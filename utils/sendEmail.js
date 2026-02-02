const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
    const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // TLS
        auth: {
            user: process.env.SMTP_MAIL,
            pass: process.env.SMTP_PASSWORD, // APP PASSWORD
        },
        tls: {
            rejectUnauthorized: false,
        },
        connectionTimeout: 10000, // 10s
    });

    await transporter.verify(); // 🔥 THIS WILL THROW IF BLOCKED

    await transporter.sendMail({
        from: `"Whisp" <${process.env.SMTP_MAIL}>`,
        to: options.email,
        subject: options.subject,
        html: options.message,
    });
};

module.exports = sendEmail;
