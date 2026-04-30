/**
 * gmailTool.js
 *
 * Sends email via two paths, tried in order:
 *
 *   1. Nodemailer SMTP   — set GMAIL_USER + GMAIL_APP_PASSWORD in .env
 *                          (simplest — no OAuth dance required)
 *
 *   2. Google OAuth API  — requires credentials.json + token.json
 *                          (the original implementation, kept for compatibility)
 *
 * Setup for Path 1 (recommended):
 *   a) Enable 2-Step Verification on your Google account
 *   b) Visit https://myaccount.google.com/apppasswords
 *   c) Generate an App Password for "Mail"
 *   d) Add to .env:
 *        GMAIL_USER=your@gmail.com
 *        GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
 */

import nodemailer from "nodemailer";
import { google }  from "googleapis";
import fs          from "fs";
import path        from "path";
import readline    from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, "../../credentials.json");
const TOKEN_PATH       = path.join(__dirname, "../../token.json");

// ── Path 1 — Nodemailer SMTP ──────────────────────────────────────────────────

async function sendViaSmtp({ to, subject, body }) {
  // Accept either naming convention from .env
  const user     = process.env.GMAIL_USER     || process.env.EMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

  if (!user || !password) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: password },
  });

  await transporter.sendMail({
    from:    `"AI Co-Pilot" <${user}>`,
    to,
    subject,
    text: body,
  });

  return { success: true, message: "Email sent successfully (SMTP)" };
}

// ── Path 2 — Google OAuth API (original) ─────────────────────────────────────

async function authorizeOAuth() {
  const content     = fs.readFileSync(CREDENTIALS_PATH);
  const credentials = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
  });

  console.log("\n👉 Open this URL in your browser:\n", authUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve, reject) => {
    rl.question("\nPaste the authorisation code here: ", (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return reject(err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log("✅ Token stored.");
        resolve(oAuth2Client);
      });
    });
  });
}

async function sendViaOAuth({ to, subject, body }) {
  const auth   = await authorizeOAuth();
  const gmail  = google.gmail({ version: "v1", auth });

  const raw = [
    `To: ${to}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body,
  ].join("\n");

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

  return { success: true, message: "Email sent successfully (OAuth)" };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, body }) {
  // Validate recipient
  if (!to || !to.includes("@")) {
    throw new Error(`Invalid recipient address: "${to}"`);
  }

  // Try SMTP first (env-var based, no setup friction)
  const smtpUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
  if (smtpUser && smtpPass) {
    try {
      return await sendViaSmtp({ to, subject, body });
    } catch (err) {
      if (err.message !== "SMTP_NOT_CONFIGURED") {
        // Real SMTP error — log and fall through to OAuth
        console.error("[gmailTool] SMTP failed:", err.message);
      }
    }
  }

  // Fall back to OAuth (requires credentials.json + token.json)
  if (fs.existsSync(CREDENTIALS_PATH)) {
    return await sendViaOAuth({ to, subject, body });
  }

  throw new Error(
    "Email configuration missing. Please check EMAIL_USER and EMAIL_PASS in your .env file."
  );
}
