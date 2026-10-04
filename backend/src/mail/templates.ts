import type { Mail } from "./mailer.js";
import { appUrl, REPLY_TO } from "./mailer.js";

// The app's emails: a branded card (decided with the owner, 2026-10-04) with
// a plain-text copy of every one. The HTML is tables and inline styles on
// purpose: that's what mail apps render reliably. Nothing in here takes text
// a shopper typed, so nothing they type can end up as markup.

const BRAND = "#0d7a70";
const INK = "#14161a";
const MUTED = "#6b7280";
const PAGE = "#f6f7f9";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Content {
  subject: string;
  /** The line a mail app shows next to the subject. */
  preview: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; href: string };
  /** Small print under the button. */
  note?: string;
  /** A second, quieter link, e.g. "Forgot your password?". */
  extra?: { lead: string; label: string; href: string };
}

function render(to: string, c: Content): Mail {
  const base = appUrl();
  const privacy = `${base}/privacy`;

  const text = [
    "Accucery",
    "",
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.button ? [`${c.button.label}: ${c.button.href}`, ""] : []),
    ...(c.note ? [c.note, ""] : []),
    ...(c.extra ? [`${c.extra.lead} ${c.extra.label}: ${c.extra.href}`, ""] : []),
    "-- ",
    "Accucery - compare grocery prices in South Africa",
    `Questions? Reply to this email or write to ${REPLY_TO}.`,
    `Privacy notice: ${privacy}`,
  ].join("\n");

  const p = (s: string) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:${INK};">${escape(s)}</p>`;
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="border-radius:10px;background:${BRAND};">
<a href="${escape(c.button.href)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escape(c.button.label)}</a>
</td></tr></table>`
    : "";
  const note = c.note ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${MUTED};">${escape(c.note)}</p>` : "";
  const extra = c.extra
    ? `<p style="margin:0;font-size:14px;line-height:1.5;color:${MUTED};">${escape(c.extra.lead)} <a href="${escape(c.extra.href)}" style="color:${BRAND};font-weight:600;">${escape(c.extra.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(c.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:18px 24px;">
<img src="${escape(base)}/icon-192.png" width="36" height="36" alt="" style="vertical-align:middle;border-radius:8px;border:0;">
<span style="vertical-align:middle;margin-left:10px;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">Accucery</span>
</td></tr>
<tr><td style="padding:28px 24px 24px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK};">${escape(c.heading)}</h1>
${c.paragraphs.map(p).join("\n")}
${button}
${note}
${extra}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:${MUTED};">
Accucery &middot; compare grocery prices in South Africa<br>
<a href="${escape(privacy)}" style="color:${MUTED};">Privacy notice</a> &middot; Questions? Just reply, or write to <a href="mailto:${REPLY_TO}" style="color:${MUTED};">${REPLY_TO}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { to, subject: c.subject, text, html };
}

/** Sent from the server to check email works end to end. */
export function testEmail(to: string): Mail {
  return render(to, {
    subject: "Accucery test email",
    preview: "If this is in your inbox, email is working.",
    heading: "Hello from Accucery",
    paragraphs: ["This is a test from the Accucery server. If it's in your inbox (not spam), email is working."],
    button: { label: "Open Accucery", href: appUrl() },
  });
}

/** #148: the link that creates the account. */
export function confirmEmail(to: string, link: string): Mail {
  return render(to, {
    subject: "Confirm your email for Accucery",
    preview: "One tap to finish creating your account.",
    heading: "Confirm your email",
    paragraphs: ["Tap the button to finish creating your Accucery account."],
    button: { label: "Confirm my email", href: link },
    note: "This link works once and expires in 24 hours. If you didn't sign up, ignore this email: no account is created.",
  });
}

/**
 * #148: someone signed up with an address that already has an account. Sent
 * instead of a confirm link, so the sign-up screen can answer the same way
 * either way and never says which emails have accounts.
 */
export function alreadyRegisteredEmail(to: string, signInLink: string, resetLink: string): Mail {
  return render(to, {
    subject: "You already have an Accucery account",
    preview: "Sign in instead, or reset your password.",
    heading: "You already have an account",
    paragraphs: ["Someone, hopefully you, tried to create an Accucery account with this email. You already have one, so just sign in."],
    button: { label: "Sign in", href: signInLink },
    note: "If this wasn't you, you can ignore this email. Nothing has changed.",
    extra: { lead: "Forgot your password?", label: "Reset it", href: resetLink },
  });
}

/** #149: the link to choose a new password. */
export function resetPasswordEmail(to: string, link: string): Mail {
  return render(to, {
    subject: "Reset your Accucery password",
    preview: "Choose a new password. The link expires in an hour.",
    heading: "Reset your password",
    paragraphs: ["Tap the button to choose a new password for your Accucery account."],
    button: { label: "Choose a new password", href: link },
    note: "This link works once and expires in 1 hour. If you didn't ask for it, ignore this email: your password stays the same.",
  });
}
