import type * as Nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.SMTP_PORT || "465");
const SECURE = (process.env.SMTP_SECURE || "true").toLowerCase() === "true";
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || `Indian Infra <${USER}>`;

let transporter: Nodemailer.Transporter | null = null;

function getTransporter(): Nodemailer.Transporter {
  if (!USER || !PASS) {
    throw new Error("SMTP_USER / SMTP_PASS are not configured");
  }
  if (!transporter) {
    // Lazy-loaded: importing nodemailer at module scope pushes first-load
    // past the 10s deployment-analysis timeout on slower build machines.
    const nodemailer = require("nodemailer") as typeof import("nodemailer");
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: SECURE,
      auth: { user: USER, pass: PASS },
    });
  }
  return transporter;
}

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  await getTransporter().sendMail({
    from: MAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
