import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type UserRole =
  | "patient"
  | "clinician"
  | "nurse"
  | "admin"
  | "superadmin";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
  };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: "Authentication is not configured" });
    }

    const payload = jwt.verify(token, secret) as jwt.JwtPayload;

    if (
      typeof payload.sub !== "string" ||
      !["patient", "clinician", "nurse", "admin", "superadmin"].includes(
        String(payload.role)
      )
    ) {
      return res.status(401).json({ error: "Invalid authentication token" });
    }

    req.user = {
      id: payload.sub,
      role: payload.role as UserRole
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
