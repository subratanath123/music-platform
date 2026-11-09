import nodemailer, { type Transporter } from "nodemailer";

const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || "587");
const smtpUser = process.env.SMTP_USER?.trim() ?? "";
// Gmail shows app passwords in groups of four; the spaces are not part of the password.
const smtpPass = (process.env.SMTP_PASS ?? "").replace(/\s+/g, "");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

let transporter: Transporter | null = null;
let disabledReason: string | null = null;
let warnedMissingConfig = false;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mailerStatus() {
  if (!smtpUser || !smtpPass) return { enabled: false, reason: "SMTP_USER / SMTP_PASS not set" };
  if (disabledReason) return { enabled: false, reason: disabledReason };
  return { enabled: true, reason: null };
}

function getTransporter(): Transporter | null {
  if (!smtpUser || !smtpPass) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn("[SurShongi Mailer] Email alerts are off: set SMTP_USER and SMTP_PASS (a Gmail App Password).");
    }
    return null;
  }
  if (disabledReason) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }
  return transporter;
}

export async function sendGmailNotification({
  toEmail,
  subject,
  html,
}: {
  toEmail?: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!toEmail || !toEmail.includes("@")) return false;
  const mailer = getTransporter();
  if (!mailer) return false;

  try {
    await mailer.sendMail({
      from: `"SurShongi (সুরসঙ্গী)" <${smtpUser}>`,
      to: toEmail,
      subject,
      html,
    });
    return true;
  } catch (err) {
    const code = (err as { code?: string; responseCode?: number }).code;
    if (code === "EAUTH") {
      disabledReason = "Gmail rejected SMTP_USER/SMTP_PASS";
      console.error(
        `[SurShongi Mailer] Gmail rejected the login for ${smtpUser}. Email alerts are paused until restart.\n` +
          "  Fix: turn on 2-Step Verification for this Google account, create an App Password at " +
          "https://myaccount.google.com/apppasswords, put the 16-character code in SMTP_PASS and restart the server.",
      );
    } else {
      console.error("[SurShongi Mailer] Failed to send email:", (err as Error).message ?? err);
    }
    return false;
  }
}

export async function notifyOrderPlacedEmail({
  musicianEmail,
  musicianName,
  buyerName,
  orderTitle,
  priceBdt,
  deliveryDays,
  description,
  musicianId,
}: {
  musicianEmail?: string;
  musicianName: string;
  buyerName: string;
  orderTitle: string;
  priceBdt: number;
  deliveryDays: number;
  description: string;
  musicianId: string;
}): Promise<boolean> {
  return sendGmailNotification({
    toEmail: musicianEmail,
    subject: `🎵 New Order Placed by ${buyerName}: "${orderTitle}" (৳${priceBdt})`,
    html: `
      <div style="font-family:sans-serif;background:#141414;color:#f5f5f5;padding:24px;border-radius:16px;max-width:560px">
        <h2 style="color:#ff5500;margin-top:0">সুরসঙ্গী (SurShongi) — New Order Placed!</h2>
        <p>Hi <strong>${escapeHtml(musicianName)}</strong>,</p>
        <p><strong>${escapeHtml(buyerName)}</strong> has placed a new music collaboration order with you:</p>
        <div style="background:#1f1a17;border:1px solid #ff5500;padding:16px;border-radius:12px;margin:16px 0">
          <p style="margin:0 0 8px;font-size:16px;font-weight:bold;color:#ffaa33">${escapeHtml(orderTitle)}</p>
          <p style="margin:0 0 8px;color:#d4d4d4">${escapeHtml(description || "Session collaboration order")}</p>
          <p style="margin:0;font-size:14px;color:#a3a3a3">
            <strong>Budget:</strong> ৳${escapeHtml(priceBdt)} &nbsp;·&nbsp; <strong>Delivery:</strong> ${escapeHtml(deliveryDays)} days
          </p>
        </div>
        <p>Open your SurShongi chat window or profile to deliver the work:</p>
        <p>
          <a href="${siteUrl}/u/${escapeHtml(musicianId)}" style="display:inline-block;background:#ff5500;color:#1a0900;font-weight:bold;padding:10px 20px;border-radius:999px;text-decoration:none">
            Open SurShongi Profile & Chat
          </a>
        </p>
      </div>
    `,
  });
}

export async function notifyOrderCompletedEmail({
  musicianEmail,
  buyerEmail,
  musicianName,
  buyerName,
  orderTitle,
  priceBdt,
  rating,
  reviewComment,
  musicianId,
}: {
  musicianEmail?: string;
  buyerEmail?: string;
  musicianName: string;
  buyerName: string;
  orderTitle: string;
  priceBdt: number;
  rating: number;
  reviewComment: string;
  musicianId: string;
}): Promise<void> {
  const stars = "★".repeat(Math.max(1, Math.min(5, rating)));
  const html = `
    <div style="font-family:sans-serif;background:#141414;color:#f5f5f5;padding:24px;border-radius:16px;max-width:560px">
      <h2 style="color:#ff5500;margin-top:0">✅ Order Completed & Reviewed on SurShongi</h2>
      <p><strong>${escapeHtml(buyerName)}</strong> marked the order <strong>"${escapeHtml(orderTitle)}"</strong> (৳${escapeHtml(priceBdt)}) with <strong>${escapeHtml(musicianName)}</strong> as <strong>Completed</strong>!</p>
      <div style="background:#1f1a17;border:1px solid #ffaa33;padding:16px;border-radius:12px;margin:16px 0">
        <p style="margin:0 0 6px;color:#ffaa33;font-size:18px">${stars} (${escapeHtml(rating)}/5)</p>
        <p style="margin:0;color:#f5f5f5;font-style:italic">"${escapeHtml(reviewComment)}"</p>
      </div>
      <p>This verified order review is now live on ${escapeHtml(musicianName)}'s profile:</p>
      <p>
        <a href="${siteUrl}/u/${escapeHtml(musicianId)}" style="display:inline-block;background:#ff5500;color:#1a0900;font-weight:bold;padding:10px 20px;border-radius:999px;text-decoration:none">
          View Review on Profile
        </a>
      </p>
    </div>
  `;

  await Promise.all([
    sendGmailNotification({
      toEmail: musicianEmail,
      subject: `⭐ ${buyerName} completed order "${orderTitle}" & left a ${rating}-star review!`,
      html,
    }),
    buyerEmail && buyerEmail !== musicianEmail
      ? sendGmailNotification({
          toEmail: buyerEmail,
          subject: `✅ Your order "${orderTitle}" with ${musicianName} is marked Completed`,
          html,
        })
      : Promise.resolve(false),
  ]);
}

export async function notifyUnseenMessageEmail({
  recipientEmail,
  recipientName,
  senderName,
  messageText,
  recipientId,
}: {
  recipientEmail?: string;
  recipientName: string;
  senderName: string;
  messageText: string;
  recipientId: string;
}): Promise<boolean> {
  return sendGmailNotification({
    toEmail: recipientEmail,
    subject: `💬 Unseen message from ${senderName} waiting for over 1 hour on SurShongi`,
    html: `
      <div style="font-family:sans-serif;background:#141414;color:#f5f5f5;padding:24px;border-radius:16px;max-width:560px">
        <h2 style="color:#ff5500;margin-top:0">💬 You have an unseen message on SurShongi</h2>
        <p>Hi <strong>${escapeHtml(recipientName)}</strong>,</p>
        <p><strong>${escapeHtml(senderName)}</strong> sent you a message over 1 hour ago that you haven't seen yet:</p>
        <blockquote style="background:#1f1a17;border-left:4px solid #ff5500;padding:12px 16px;margin:16px 0;color:#f5f5f5">
          "${escapeHtml(messageText)}"
        </blockquote>
        <p>
          <a href="${siteUrl}/u/${escapeHtml(recipientId)}" style="display:inline-block;background:#ff5500;color:#1a0900;font-weight:bold;padding:10px 20px;border-radius:999px;text-decoration:none">
            Reply on SurShongi
          </a>
        </p>
      </div>
    `,
  });
}
