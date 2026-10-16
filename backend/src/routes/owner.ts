import type { FastifyInstance } from "fastify";
import type { OwnerDashboard } from "@accucery/types";
import { isOwner } from "../owner.js";
import { ownerDashboard } from "../services/ownerDashboard.js";

// The Owner's dashboard. To anyone else these addresses don't exist: the same
// 404 as an unknown address, so nothing says there's something here to find.
export async function ownerRoutes(app: FastifyInstance) {
  // Whether to show the Profile page's Dashboard link.
  app.get("/owner", async (req, reply) => {
    if (!(await isOwner(req))) return reply.callNotFound();
    return reply.status(204).send();
  });

  app.get<{ Reply: OwnerDashboard }>("/owner/dashboard", async (req, reply) => {
    if (!(await isOwner(req))) return reply.callNotFound();
    // Fresh each time it's asked: the Owner presses Refresh to see now.
    reply.header("Cache-Control", "no-store");
    return ownerDashboard();
  });
}
