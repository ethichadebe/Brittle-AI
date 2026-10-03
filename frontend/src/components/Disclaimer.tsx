import { STORE_CONFIGS } from "@accucery/types";

const STORE_NAMES = STORE_CONFIGS.map((s) => s.name);
const NAMED = `${STORE_NAMES.slice(0, -1).join(", ")} or ${STORE_NAMES[STORE_NAMES.length - 1]}`;

/** #150: what a price here is, and isn't. */
export const DISCLAIMER = `Prices are a guide and may differ in store. Accucery isn't connected to ${NAMED}. Their logos belong to them.`;

export function Disclaimer({ as: Tag = "p", className = "" }: { as?: "p" | "li"; className?: string }) {
  return <Tag className={`disclaimer ${className}`.trim()}>{DISCLAIMER}</Tag>;
}
