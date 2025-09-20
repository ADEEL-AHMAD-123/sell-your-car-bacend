const nodemailer = require("nodemailer");
const path = require("path");
const ejs = require("ejs");

// transporter for promotional emails via Mailjet
const promoTransporter = nodemailer.createTransport({
  host: "in-v3.mailjet.com",
  port: 587,
  secure: false, 
  auth: {
    user: "475bd7af2c9c667b5d18a8dbf567c951", 
    pass: "a21004a9cacbc75722bbf6c9e496df31",
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
