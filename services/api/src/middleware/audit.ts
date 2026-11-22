import type { Request } from "express";
import db from "../db.js";
import type { AuthRequest } from "./auth.js";

export async function writeAudit(
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string | null = null,
  actorUserId: string | null = (req as AuthRequest).user?.id ?? null,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db("mc_audit_logs").insert({
      actor_user_id: actorUserId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: req.ip || null,
      user_agent: req.get("user-agent") || null,
      details
    });
  } catch (err) {
    // Never log request bodies, credentials, tokens, or patient details.
    console.error("Audit write failed:", err instanceof Error ? err.message : "Unknown error");
    throw new Error("Audit logging failed");
  }
}
