// Where to go after signing in (#115), e.g. back to the list whose Compare
// asked for it. Only ever a path inside Accucery: a link carrying
// "?then=https://elsewhere" or "//elsewhere" must not send a freshly signed-in
// Shopper off to someone else's site.
export function safeReturnPath(then: unknown, fallback = "/profile"): string {
  if (typeof then !== "string") return fallback;
  if (!then.startsWith("/") || then.startsWith("//") || then.startsWith("/\\")) return fallback;
  return then;
}
