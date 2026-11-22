import { Router } from "express";
import Joi from "joi";
import db from "../db.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

const router = Router();

// Protect healthcare data: clinical and administrative staff only.
router.use(authenticate, authorize("clinician", "nurse", "admin", "superadmin"));

const patientSchema = Joi.object({
  mrn: Joi.string().trim().max(50).required(),
  first_name: Joi.string().trim().max(100).required(),
  last_name: Joi.string().trim().max(100).required(),
  date_of_birth: Joi.date().iso().required(),
  gender: Joi.string().max(30).optional(),
  blood_group: Joi.string().max(5).optional(),
  phone: Joi.string().max(30).optional(),
  email: Joi.string().email().max(255).optional(),
  address: Joi.object().optional(),
  emergency_contact: Joi.object().optional()
}).unknown(false);

router.post("/", async (req, res) => {
  const { error, value } = patientSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      error: "Validation failed",
      details: error.details.map((item) => item.message)
    });
  }

  try {
    const [patient] = await db("mc_patients")
      .insert(value)
      .returning([
        "id",
        "mrn",
        "first_name",
        "last_name",
        "date_of_birth",
        "created_at"
      ]);

    await writeAudit(req, "PATIENT_CREATED", "patient", patient.id);

    return res.status(201).json({
      message: "Patient registered successfully",
      patient
    });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "A patient with this MRN or user ID already exists"
      });
    }

    console.error("Patient registration failed:", err.message);
    return res.status(500).json({ error: "Unable to register patient" });
  }
});

router.get("/", async (req, res) => {
  try {
    const patients = await db("mc_patients")
      .select(
        "id",
        "mrn",
        "first_name",
        "last_name",
        "date_of_birth",
        "gender",
        "created_at"
      )
      .orderBy("created_at", "desc")
      .limit(100);

    await writeAudit(req, "PATIENT_LIST_VIEWED", "patient", null, undefined, { count: patients.length });
    return res.json({ count: patients.length, patients });
  } catch (err: any) {
    console.error("Patient listing failed:", err.message);
    return res.status(500).json({ error: "Unable to retrieve patients" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const patient = await db("mc_patients")
      .where({ id: req.params.id })
      .first();

    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    await writeAudit(req, "PATIENT_VIEWED", "patient", patient.id);
    return res.json({ patient });
  } catch (err: any) {
    console.error("Patient retrieval failed:", err.message);
    return res.status(500).json({ error: "Unable to retrieve patient" });
  }
});

export default router;
