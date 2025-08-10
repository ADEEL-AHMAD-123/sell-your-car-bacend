const nodemailer = require("nodemailer");
const path = require("path");
const ejs = require("ejs");
const dotenv = require('dotenv');
dotenv.config();


const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // Use 'true' if the port is 465, 'false' for 587
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
      from: `SellYourCar <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.log(process.env.EMAIL_HOST,process.env.EMAIL_USER,process.env.EMAIL_PASS)
    console.error("Email failed:", err.message);
    throw new Error("Failed to send email.");
  }
};

module.exports = sendEmail;
