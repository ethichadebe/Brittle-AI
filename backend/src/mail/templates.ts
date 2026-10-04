import type { Mail } from "./mailer.js";
import { REPLY_TO } from "./mailer.js";

// Plain text on purpose (#147): it reads the same in every mail app, has
// nothing to render wrongly, and looks less like spam than a heavy layout.

function layout(greeting: string, body: string): string {
  return [
    "Accucery",
    "",
    greeting,
    "",
    body,
    "",
    "-- ",
    "Accucery - compare grocery prices in South Africa",
    `Questions? Reply to this email or write to ${REPLY_TO}.`,
  ].join("\n");
}

/** Sent from the server to check email works end to end. */
export function testEmail(to: string): Mail {
  return {
    to,
    subject: "Accucery test email",
    text: layout(
      "Hello,",
      "This is a test from the Accucery server. If it's in your inbox (not spam), email is working."
    ),
  };
}
