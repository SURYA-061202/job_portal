// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
// SMTP / Env config (same defaults as other function)
const HOSTNAME = Deno.env.get("SMTP_HOST") || "sandbox.smtp.mailtrap.io";
const PORT = Number(Deno.env.get("SMTP_PORT") || "2525");
const TLS = (Deno.env.get("SMTP_SECURE") || "true").toLowerCase() === "true";
const USER = Deno.env.get("SMTP_USER") || "talent.indianinfra@gmail.com";
const PASS = Deno.env.get("SMTP_PASS") || "abkzhcigopduzdao";
const MAIL_FROM = Deno.env.get("MAIL_FROM") || `Indian Infra <${USER}>`;
const client = new SMTPClient({
  connection: {
    hostname: HOSTNAME,
    port: PORT,
    tls: TLS,
    auth: {
      username: USER,
      password: PASS
    }
  },
  ...TLS ? {} : {
    debug: {
      noStartTLS: true,
      allowUnsecure: true
    }
  }
});
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json"
  };
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders()
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      success: false,
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
  try {
    /**
     * Expected body: { candidate: { name: string, email: string } }
     */ const { candidate } = await req.json();
    if (!candidate?.email) {
      return new Response(JSON.stringify({
        success: false,
        error: "Candidate email missing"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;">
        <h2 style="color:#1d4ed8;">Congratulations – Offer from Indian Infra</h2>
        <p>Hi ${candidate.name?.split(" ")[0] || "there"},</p>
        <p>We are delighted to inform you that you have been <strong>selected</strong> to join <strong>Indian Infra</strong>.</p>
        <p>To proceed with the onboarding process, kindly email the scanned copies of the following documents to us by replying to this email:</p>
        <ul style="padding-left:20px;color:#0f172a;font-size:14px;">
          <li>MarkSheets</li>
          <li>Degree Completion Certificates</li>
          <li>Experience Certificate (if applicable)</li>
          <li>Bank Account Details</li>
        </ul>
        <p style="margin-top:16px;color:#d97706;font-weight:bold;">Fill the Onborading form:</p>
        <p><a href="https://forms.gle/bv9Lc6SXWn6MHW6WA" style="color:#1d4ed8;">https://forms.gle/bv9Lc6SXWn6MHW6WA</a></p>
        <p>Our team will review the documents and get back to you with further steps.</p>
        <p>We look forward to having you on board.</p>
        <p>Best regards,<br/>HR Team<br/>Indian Infra</p>
      </div>
    `;
    await client.send({
      from: MAIL_FROM,
      to: candidate.email,
      subject: `Offer Letter – Welcome to Indian Infra`,
      content: "Please view this email in an HTML capable client.",
      html
    });
    return new Response(JSON.stringify({
      success: true
    }), {
      status: 200,
      headers: corsHeaders()
    });
  } catch (err) {
    console.error("send_congratulations_mail function error", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: corsHeaders()
    });
  }
});
