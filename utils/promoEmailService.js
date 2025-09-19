// utils/promoEmailService.js
const nodemailer = require("nodemailer");
const path = require("path");
const ejs = require("ejs");
const dotenv = require('dotenv');
dotenv.config();

// transporter for promotional emails via Mailjet
const promoTransporter = nodemailer.createTransport({
  host: process.env.MAILJET_HOST,
  port: process.env.MAILJET_PORT,
  secure: false, // Use 'true' if port is 465
  auth: {
    user: process.env.MAILJET_USER, 
    pass: process.env.MAILJET_PASS,
  },
});

const sendPromoEmail = async ({ to, subject, templateName, templateData }) => {
  try {
    const templatePath = path.join(__dirname, "..", "emails", `${templateName}.ejs`);
    const html = await ejs.renderFile(templatePath, templateData);

    await promoTransporter.sendMail({
      from: `SellYourCar <promo@sellyourcar.info>`, 
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("Promotional email failed:", err.message);
    throw new Error("Failed to send promotional email.");
  }
};

module.exports = sendPromoEmail;