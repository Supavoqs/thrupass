const nodemailer = require('nodemailer');

// All SMTP credentials come from environment variables — set these in the
// cPanel Node.js Selector's environment variables tab, using the mailbox
// credentials for accounts@thrupass.co.za (Email Accounts section in cPanel).
const {
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  NOTIFY_EMAIL = 'accounts@thrupass.co.za',
  MAIL_FROM,
} = process.env;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE ? SMTP_SECURE === 'true' : Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.warn('mailer: SMTP_HOST/SMTP_USER/SMTP_PASS not set — registration notification emails are disabled.');
}

// Fire-and-forget: a notification email failing to send must never block or
// fail the registration request that triggered it.
function notify(subject, text) {
  if (!transporter) return;
  transporter.sendMail({ from: MAIL_FROM || SMTP_USER, to: NOTIFY_EMAIL, subject, text }).catch((err) => {
    console.error('mailer: failed to send notification email:', err.message);
  });
}

module.exports = { notify };
