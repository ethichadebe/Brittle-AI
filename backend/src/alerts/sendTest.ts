import { telegramFromEnv } from "./telegram.js";

// #155: proves the alerts reach the phone. On the server:
//
//   docker compose -f docker-compose.prod.yml exec backend node dist/alerts/sendTest.js
//
// It says what went wrong if it didn't, and never prints the token.
async function main() {
  const notifier = telegramFromEnv();
  if (!notifier) {
    console.log("Not sent: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID aren't both set in the backend.");
    process.exit(1);
  }
  const result = await notifier.send("👋 Test from Accucery: the app's own alerts reach you here.");
  if (result.ok) {
    console.log("Sent. Check Telegram.");
    return;
  }
  console.log(`Not sent: Telegram said "${result.error}".`);
  if (/unauthorized|not found/i.test(result.error ?? "") && !/chat/i.test(result.error ?? "")) console.log("That usually means TELEGRAM_BOT_TOKEN is wrong.");
  if (/chat not found/i.test(result.error ?? "")) console.log("That usually means TELEGRAM_CHAT_ID is wrong, or you haven't messaged the bot yet.");
  process.exit(1);
}

if (process.argv[1]?.endsWith("sendTest.js")) void main();
