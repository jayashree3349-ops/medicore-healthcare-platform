import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import express from "express";
import appointmentsRouter from "./routes/appointments.js";
import analyticsRouter from "./routes/analytics.js";
import authRouter from "./routes/auth.js";
import clinicalRouter from "./routes/clinical.js";
import db from "./db.js";
import patientsRouter from "./routes/patients.js";
import fhirRouter from "./routes/fhir.js";
import mfaRouter from "./routes/mfa.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." }
});


const requestCounts = new Map<string, number>();

app.use((req, res, next) => {
  if (req.path !== "/metrics") {
    res.on("finish", () => {
      const key = `${req.method}|${res.statusCode}`;
      requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
    });
  }
  next();
});

app.get("/metrics", (_req, res) => {
  const lines = [
    "# HELP medicore_http_requests_total HTTP requests handled by MediCore",
    "# TYPE medicore_http_requests_total counter",
    ...Array.from(requestCounts, ([key, count]) => {
      const [method, status] = key.split("|");
      return `medicore_http_requests_total{method="${method}",status="${status}"} ${count}`;
    }),
    "# HELP medicore_process_uptime_seconds MediCore process uptime",
    "# TYPE medicore_process_uptime_seconds gauge",
    `medicore_process_uptime_seconds ${process.uptime()}`,
    "# HELP medicore_process_resident_memory_bytes Resident memory in bytes",
    "# TYPE medicore_process_resident_memory_bytes gauge",
    `medicore_process_resident_memory_bytes ${process.memoryUsage().rss}`
  ];
  res.type("text/plain; version=0.0.4; charset=utf-8").send(lines.join("\n") + "\n");
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", authRouter);
app.use("/api/auth/mfa", mfaRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/clinical", clinicalRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/fhir/r4", fhirRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "medicore-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/ready", async (_req, res) => {
  try {
    await db.raw("SELECT 1");
    res.status(200).json({
      status: "ready",
      database: "connected"
    });
  } catch {
    res.status(503).json({
      status: "not_ready",
      database: "disconnected"
    });
  }
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`MediCore API running on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  server.close();
  await db.destroy();
  process.exit(0);
});
