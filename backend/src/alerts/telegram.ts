// #155: alerts to the owner's phone, through the same Telegram bot the deploy
// and the site monitor already message (ethichadebe/workflows). Off unless
// both settings are present; nothing here ever logs the token.

export interface SendResult {
  ok: boolean;
  /** Telegram's own reason when it refuses (e.g. "Unauthorized", "Bad Request: chat not found"). */
  error?: string;
}

export interface Notifier {
  send(text: string): Promise<SendResult>;
}

// Anything key-shaped that an error message might carry: the ScraperAPI key
// itself, or an api_key= in a URL. Alerts quote errors, so they pass through this.
export function redact(text: string, secrets: (string | undefined)[] = [process.env.SCRAPERAPI_KEY]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join("[hidden]");
  return out.replace(/(api_key=)[^&\s"']+/gi, "$1[hidden]");
}

export function telegramFromEnv(
  token = process.env.TELEGRAM_BOT_TOKEN,
  chatId = process.env.TELEGRAM_CHAT_ID,
  fetchFn: typeof fetch = fetch
): Notifier | null {
  // "..." is what .env.example used to suggest; treat it as unset, not as a token.
  if (!token || !chatId || token === "..." || chatId === "...") return null;
  return {
    async send(text) {
      try {
        const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: redact(text), disable_web_page_preview: true }),
          signal: AbortSignal.timeout(15_000),
        });
        // Telegram answers {"ok":true,...} or {"ok":false,"description":"..."}.
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
        if (res.ok && body.ok) return { ok: true };
        return { ok: false, error: body.description ?? `${res.status} ${res.statusText}` };
      } catch (err) {
        // A network error's message names no URL, so no token; still, only the message.
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
