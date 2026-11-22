import { Router } from "express";
import Joi from "joi";
import db from "../db.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import {
  encryptMfaSecret,
  decryptMfaSecret,
  generateSecret,
  generateURI,
  verify
} from "../utils/mfa.js";

const router = Router();

router.post("/setup", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await db("mc_users")
      .where({ id: req.user!.id, is_active: true })
      .first("id", "email", "mfa_enabled");

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.mfa_enabled) {
      return res.status(409).json({ error: "MFA is already enabled" });
    }

    const secret = await generateSecret();
    const encrypted = encryptMfaSecret(secret);
    const otpauth_url = await generateURI({
      issuer: "MediCore",
      label: user.email,
      secret
    });

    await db("mc_users")
      .where({ id: user.id })
      .update({ mfa_secret_encrypted: encrypted });

    await writeAudit(req, "MFA_SETUP_STARTED", "user", user.id);

    return res.json({
      message: "Add this account to your authenticator app, then verify the code",
      secret,
      otpauth_url
    });
  } catch (err) {
    console.error("MFA setup error:", err instanceof Error ? err.message : "Unknown error");
    return res.status(500).json({ error: "MFA setup failed" });
  }
});

router.post("/enable", authenticate, async (req: AuthRequest, res) => {
  const schema = Joi.object({
    token: Joi.string().pattern(/^[0-9]{6}$/).required()
  }).unknown(false);

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: "A six-digit authenticator code is required" });

  try {
    const user = await db("mc_users")
      .where({ id: req.user!.id, is_active: true })
      .first("id", "mfa_enabled", "mfa_secret_encrypted");

    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.mfa_enabled) {
      return res.status(409).json({ error: "MFA is already enabled" });
    }
    if (!user.mfa_secret_encrypted) {
      return res.status(400).json({ error: "Complete MFA setup first" });
    }

    const secret = decryptMfaSecret(user.mfa_secret_encrypted);
    const result = await verify({ secret, token: value.token });

    if (!result.valid) {
      return res.status(401).json({ error: "Invalid authenticator code" });
    }

    await db("mc_users").where({ id: user.id }).update({ mfa_enabled: true });
    await writeAudit(req, "MFA_ENABLED", "user", user.id);

    return res.json({ message: "MFA enabled successfully" });
  } catch (err) {
    console.error("MFA enable error:", err instanceof Error ? err.message : "Unknown error");
    return res.status(500).json({ error: "MFA verification failed" });
  }
});

export default router;
