const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

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

// Emails the attendee their ticket's QR code (embedded inline) right after
// it's issued/paid — the same QR they'd see in the app and that the gate
// scans. Fire-and-forget for the same reason as notify(): a mail failure
// must never roll back or block ticket issuance.
async function sendTicketQr({ to, holder, eventName, tier, ticketUrl }) {
  if (!transporter) return;
  try {
    const qrPng = await QRCode.toBuffer(ticketUrl, { width: 320, margin: 1 });
    await transporter.sendMail({
      from: MAIL_FROM || SMTP_USER,
      to,
      subject: `Your Thru Pass ticket — ${eventName}`,
      text: `Hi ${holder},\n\nYour ${tier} ticket for ${eventName} is confirmed.\n\nShow this link's QR code at the gate to enter:\n${ticketUrl}\n\nSee you there!`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;">
          <p>Hi ${holder},</p>
          <p>Your <strong>${tier}</strong> ticket for <strong>${eventName}</strong> is confirmed.</p>
          <p>Show this QR code at the gate to enter:</p>
          <img src="cid:ticketqr" width="240" height="240" alt="Ticket QR code" />
          <p style="font-size:13px;color:#666;">Or open your ticket here: <a href="${ticketUrl}">${ticketUrl}</a></p>
          <p style="font-size:12px;color:#999;">Keep this email private — anyone with this QR code can use your ticket.</p>
        </div>
      `,
      attachments: [{ filename: 'ticket-qr.png', content: qrPng, cid: 'ticketqr' }],
    });
  } catch (err) {
    console.error('mailer: failed to send ticket QR email:', err.message);
  }
}

module.exports = { notify, sendTicketQr };
