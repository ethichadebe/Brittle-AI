// Sends one test email from the server (#147):
//
//   docker compose -f docker-compose.prod.yml exec backend node dist/mail/sendTest.js you@example.com
//
// Prints Resend's id on success, or exactly why it refused.

import { sendMail } from "./mailer.js";
import { testEmail } from "./templates.js";

const to = process.argv[2] ?? "";
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Usage: node dist/mail/sendTest.js you@example.com");
  process.exit(2);
}

try {
  const id = await sendMail(testEmail(to));
  console.log(id === "not-sent" ? "Not sent: RESEND_API_KEY isn't set in this container." : `Sent. Resend id ${id}. Check the inbox, and the spam folder.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
