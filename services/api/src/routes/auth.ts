import { Router } from "express";
import Joi from "joi";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";
import { decryptMfaSecret, verify } from "../utils/mfa.js";

const router = Router();

const registrationSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(12).max(128).required(),
  first_name: Joi.string().trim().min(1).max(100).required(),
  last_name: Joi.string().trim().min(1).max(100).required(),
  phone: Joi.string().max(30).optional()
}).unknown(false);

router.post("/register", async (req, res) => {
  const { error, value } = registrationSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const email = value.email.toLowerCase();
    const password_hash = await bcrypt.hash(value.password, 12);

    const [user] = await db("mc_users")
      .insert({
        email,
        password_hash,
        first_name: value.first_name,
        last_name: value.last_name,
        phone: value.phone || null,
        role: "patient"
      })
      .returning(["id", "email", "first_name", "last_name", "role"]);

    await writeAudit(req, "USER_REGISTERED", "user", user.id, user.id, {
      role: user.role
    });
    return res.status(201).json({ message: "Registration successful", user });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("Registration error:", err.message);
    return res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    totp: Joi.string().pattern(/^[0-9]{6}$/).optional()
  }).unknown(false);

  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  try {
    const user = await db("mc_users")
      .where({ email: value.email.toLowerCase() })
      .first();

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "Account disabled" });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: "Account temporarily locked" });
    }

    if (!(await bcrypt.compare(value.password, user.password_hash))) {
      const attempts = Number(user.failed_login_attempts || 0) + 1;
      const locked = attempts >= 5;

      await db("mc_users").where({ id: user.id }).update({
        failed_login_attempts: locked ? 0 : attempts,
        locked_until: locked
          ? db.raw("NOW() + (15 * INTERVAL '1 minute')")
          : null
      });

      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.mfa_enabled) {
      if (!value.totp) {
        return res.json({ mfa_required: true });
      }

      if (!user.mfa_secret_encrypted) {
        return res.status(500).json({ error: "MFA configuration error" });
      }

      const mfaSecret = decryptMfaSecret(user.mfa_secret_encrypted);
      const result = await verify({ secret: mfaSecret, token: value.totp });

      if (!result.valid) {
        return res.status(401).json({ error: "Invalid authenticator code" });
      }
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Authentication is not configured" });
    }

    const access_token = jwt.sign(
      { role: user.role },
      secret,
      { subject: user.id, expiresIn: "15m" }
    );

    await db("mc_users").where({ id: user.id }).update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: db.fn.now()
    });

    await writeAudit(req, "USER_LOGIN", "user", user.id, user.id, {
      role: user.role
    });

    return res.json({
      access_token,
      token_type: "Bearer",
      expires_in: 900,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error("Login error:", err.message);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await db("mc_users")
      .where({ id: req.user!.id, is_active: true })
      .first("id", "email", "first_name", "last_name", "role");

    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user });
  } catch {
    return res.status(500).json({ error: "Unable to retrieve user" });
  }
});

export default router;
