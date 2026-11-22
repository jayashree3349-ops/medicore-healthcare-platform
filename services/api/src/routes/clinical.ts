import { Router } from "express";
import Joi from "joi";
import db from "../db.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

const router = Router();

// Protect healthcare data: clinical and administrative staff only.
router.use(authenticate, authorize("clinician", "nurse", "admin", "superadmin"));

const uuidSchema = Joi.string().guid({ version: ["uuidv4", "uuidv5"] });

const schemas = {
  allergies: Joi.object({
    allergen: Joi.string().trim().max(255).required(),
    reaction: Joi.string().allow("", null),
    severity: Joi.string().valid("mild", "moderate", "severe").allow(null),
    status: Joi.string().valid("active", "inactive", "resolved").default("active")
  }).unknown(false),

  conditions: Joi.object({
    condition_name: Joi.string().trim().max(255).required(),
    icd10_code: Joi.string().max(20).allow("", null),
    clinical_status: Joi.string().valid("active", "resolved", "inactive", "recurrence").default("active"),
    onset_date: Joi.date().iso().allow(null)
  }).unknown(false),

  medications: Joi.object({
    medication_name: Joi.string().trim().max(255).required(),
    dosage: Joi.string().max(100).allow("", null),
    route: Joi.string().max(100).allow("", null),
    frequency: Joi.string().max(100).allow("", null),
    start_date: Joi.date().iso().allow(null),
    end_date: Joi.date().iso().allow(null),
    status: Joi.string().valid("active", "discontinued", "completed", "on_hold").default("active")
  }).unknown(false)
};

const tables = {
  allergies: "mc_allergies",
  conditions: "mc_conditions",
  medications: "mc_medications"
} as const;

type RecordType = keyof typeof tables;

async function patientExists(patientId: string): Promise<boolean> {
  const patient = await db("mc_patients").where({ id: patientId }).first("id");
  return Boolean(patient);
}

for (const type of Object.keys(tables) as RecordType[]) {
  router.get(`/patients/:patientId/${type}`, async (req, res) => {
    try {
      const { error } = uuidSchema.validate(req.params.patientId);
      if (error) return res.status(400).json({ error: "Invalid patient ID" });

      if (!(await patientExists(req.params.patientId))) {
        return res.status(404).json({ error: "Patient not found" });
      }

      const records = await db(tables[type])
        .where({ patient_id: req.params.patientId })
        .orderBy("created_at", "desc");

      await writeAudit(
        req,
        "CLINICAL_RECORDS_VIEWED",
        type,
        req.params.patientId,
        undefined,
        { count: records.length }
      );

      return res.status(200).json({ count: records.length, records });
    } catch (err) {
      console.error(`GET ${type} error:`, err);
      return res.status(500).json({ error: "Unable to retrieve clinical records" });
    }
  });

  router.post(`/patients/:patientId/${type}`, async (req, res) => {
    try {
      const { error: idError } = uuidSchema.validate(req.params.patientId);
      if (idError) return res.status(400).json({ error: "Invalid patient ID" });

      if (!(await patientExists(req.params.patientId))) {
        return res.status(404).json({ error: "Patient not found" });
      }

      const { error, value } = schemas[type].validate(req.body, {
        abortEarly: false,
        stripUnknown: false
      });

      if (error) {
        return res.status(400).json({
          error: "Validation failed",
          details: error.details.map(item => item.message)
        });
      }

      const [record] = await db(tables[type])
        .insert({ ...value, patient_id: req.params.patientId })
        .returning("*");

      await writeAudit(
        req,
        "CLINICAL_RECORD_CREATED",
        type,
        record.id,
        undefined,
        { patient_id: req.params.patientId }
      );

      return res.status(201).json({ message: "Clinical record created", record });
    } catch (err) {
      console.error(`POST ${type} error:`, err);
      return res.status(500).json({ error: "Unable to create clinical record" });
    }
  });
}

export default router;
