// utils/emailService.js 
const nodemailer = require("nodemailer");
const path = require("path");
const ejs = require("ejs");
const dotenv = require('dotenv');
dotenv.config();
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, templateName, templateData }) => {
  try {
    const templatePath = path.join(__dirname, "..", "emails", `${templateName}.ejs`);
    const html = await ejs.renderFile(templatePath, templateData);

    await transporter.sendMail({
      from: `"Your Company" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("Email failed:", err.message);
    throw new Error("Failed to send email.");
  }
};

module.exports = sendEmail;
