import type { FastifyInstance } from "fastify";
import type { StoreSlug, SubstituteChoice, SubstituteDecisionRequest, SubstitutePairing } from "@accucery/types";
import { STORE_CONFIGS } from "@accucery/types";
import { forgetDecision, recordDecision } from "../services/substituteDecisions.js";

const CHOICES: readonly SubstituteChoice[] = ["chosen", "removed"];

function isStore(value: unknown): value is StoreSlug {
  return STORE_CONFIGS.some((s) => s.slug === value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 500;
}

function parsePairing(body: unknown): SubstitutePairing | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (!isStore(b.fromStore) || !isStore(b.toStore) || b.fromStore === b.toStore) return null;
  if (!isId(b.fromProductId) || !isId(b.toProductId)) return null;
  return { fromStore: b.fromStore, fromProductId: b.fromProductId, toStore: b.toStore, toProductId: b.toProductId };
}

function parseDecision(body: unknown): SubstituteDecisionRequest | null {
  const pairing = parsePairing(body);
  if (!pairing) return null;
  const b = body as Record<string, unknown>;
  if (!isId(b.toProductName) || !CHOICES.includes(b.choice as SubstituteChoice)) return null;
  return { ...pairing, toProductName: b.toProductName, choice: b.choice as SubstituteChoice };
}

// #91: a Shopper's remembered decisions about Substitutes. Comparing needs
// an Account (ADR 0004), and these belong to one, so both routes refuse an
// anonymous Shopper the same way the comparison itself does.
export async function substituteDecisionsRoutes(app: FastifyInstance) {
  // PUT /substitute-decisions — remember a pick or a removal
  app.put("/substitute-decisions", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in to remember a Substitute" });
    const decision = parseDecision(req.body);
    if (!decision) return reply.status(400).send({ error: "Not a valid Substitute decision" });

    await recordDecision(req.accountId, decision);
    return reply.status(204).send();
  });

  // DELETE /substitute-decisions — forget one, e.g. undoing a removal
  app.delete("/substitute-decisions", async (req, reply) => {
    if (!req.accountId) return reply.status(401).send({ error: "Sign in to remember a Substitute" });
    const pairing = parsePairing(req.body);
    if (!pairing) return reply.status(400).send({ error: "Not a valid Substitute pairing" });

    await forgetDecision(req.accountId, pairing);
    return reply.status(204).send();
  });
}
