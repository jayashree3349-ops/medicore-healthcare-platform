import { Router } from "express";
import Joi from "joi";
import db from "../db.js";
import { authenticate, authorize, type AuthRequest } from "../middleware/auth.js";
import { writeAudit } from "../middleware/audit.js";

const router = Router();

// Protect healthcare data: clinical and administrative staff only.
router.use(authenticate, authorize("clinician", "nurse", "admin", "superadmin"));

const uuidSchema = Joi.string().guid({ version: ["uuidv4", "uuidv5"] });

const statuses = [
  "requested",
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled"
];

const allowedTransitions: Record<string, string[]> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: []
};

const appointmentSchema = Joi.object({
  patient_id: uuidSchema.required(),
  clinician_id: uuidSchema.allow(null),
  appointment_type: Joi.string().max(100).allow("", null),
  reason: Joi.string().allow("", null),
  scheduled_start: Joi.date().iso().required(),
  scheduled_end: Joi.date().iso().required()
}).unknown(false).custom((value, helpers) => {
  if (new Date(value.scheduled_end) <= new Date(value.scheduled_start)) {
    return helpers.error("any.invalid");
  }
  return value;
});

router.post("/", async (req, res) => {
  try {
    const { error, value } = appointmentSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: "Invalid appointment details",
        details: error.details.map(item => item.message)
      });
    }

    const patient = await db("mc_patients")
      .where({ id: value.patient_id })
      .first("id");

    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }

    if (value.clinician_id) {
      const clinician = await db("mc_users")
        .where({
          id: value.clinician_id,
          role: "clinician",
          is_active: true
        })
        .first("id");

      if (!clinician) {
        return res.status(400).json({
          error: "Assigned user must be an active clinician"
        });
      }
    }

    if (value.clinician_id) {
      const conflict = await db("mc_appointments")
        .where({ clinician_id: value.clinician_id })
        .whereNot("status", "cancelled")
        .where("scheduled_start", "<", value.scheduled_end)
        .where("scheduled_end", ">", value.scheduled_start)
        .first("id");

      if (conflict) {
        return res.status(409).json({
          error: "Clinician already has an appointment during this time"
        });
      }
    }

    const [appointment] = await db("mc_appointments")
      .insert(value)
      .returning("*");

    await writeAudit(req, "APPOINTMENT_CREATED", "appointment", appointment.id, undefined, {
      patient_id: appointment.patient_id
    });

    return res.status(201).json({
      message: "Appointment created",
      appointment
    });
  } catch (err) {
    console.error("Create appointment error:", err);
    return res.status(500).json({ error: "Unable to create appointment" });
  }
});

router.get("/", async (req, res) => {
  try {
    const query = db("mc_appointments").select("*");

    if (req.query.patient_id) {
      const { error } = uuidSchema.validate(req.query.patient_id);
      if (error) {
        return res.status(400).json({ error: "Invalid patient ID" });
      }
      query.where({ patient_id: req.query.patient_id as string });
    }

    if (req.query.status) {
      if (!statuses.includes(req.query.status as string)) {
        return res.status(400).json({ error: "Invalid appointment status" });
      }
      query.where({ status: req.query.status as string });
    }

    const appointments = await query
      .orderBy("scheduled_start", "asc")
      .limit(100);

    await writeAudit(req, "APPOINTMENT_LIST_VIEWED", "appointment", null, undefined, {
      count: appointments.length
    });

    return res.status(200).json({
      count: appointments.length,
      appointments
    });
  } catch (err) {
    console.error("List appointments error:", err);
    return res.status(500).json({ error: "Unable to retrieve appointments" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { error } = uuidSchema.validate(req.params.id);
    if (error) return res.status(400).json({ error: "Invalid appointment ID" });

    const appointment = await db("mc_appointments")
      .where({ id: req.params.id })
      .first();

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    await writeAudit(req, "APPOINTMENT_VIEWED", "appointment", appointment.id);
    return res.status(200).json({ appointment });
  } catch (err) {
    console.error("Get appointment error:", err);
    return res.status(500).json({ error: "Unable to retrieve appointment" });
  }
});


const visitReportSchema = Joi.object({
  chief_complaint: Joi.string().max(5000).allow("", null),
  clinical_notes: Joi.string().max(20000).allow("", null),
  diagnosis: Joi.array().items(
    Joi.object({
      code: Joi.string().max(50).required(),
      display: Joi.string().max(500).required(),
      system: Joi.string().max(255).allow("", null)
    }).unknown(false)
  ).default([]),
  treatment_plan: Joi.string().max(10000).allow("", null),
  vital_signs: Joi.object().unknown(true).default({})
}).unknown(false);

router.post("/:id/report", async (req, res) => {
  try {
    const { error: idError } = uuidSchema.validate(req.params.id);
    if (idError) return res.status(400).json({ error: "Invalid appointment ID" });

    const { error, value } = visitReportSchema.validate(req.body, {
      abortEarly: false
    });

    if (error) {
      return res.status(400).json({
        error: "Invalid visit report",
        details: error.details.map(item => item.message)
      });
    }

    const appointment = await db("mc_appointments")
      .where({ id: req.params.id })
      .first("id", "patient_id", "clinician_id");

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    const actor = (req as AuthRequest).user!;
    const clinicianId =
      actor.role === "clinician" ? actor.id : appointment.clinician_id;

    const [report] = await db("mc_visit_reports")
      .insert({
        ...value,
        appointment_id: appointment.id,
        patient_id: appointment.patient_id,
        clinician_id: clinicianId
      })
      .returning("*");

    await writeAudit(req, "VISIT_REPORT_CREATED", "visit_report", report.id, undefined, {
      appointment_id: appointment.id,
      patient_id: appointment.patient_id
    });

    return res.status(201).json({ message: "Visit report created", report });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "A visit report already exists for this appointment" });
    }
    console.error("Create visit report error:", err);
    return res.status(500).json({ error: "Unable to create visit report" });
  }
});

router.get("/:id/report", async (req, res) => {
  try {
    const { error } = uuidSchema.validate(req.params.id);
    if (error) return res.status(400).json({ error: "Invalid appointment ID" });

    const report = await db("mc_visit_reports")
      .where({ appointment_id: req.params.id })
      .first();

    if (!report) {
      return res.status(404).json({ error: "Visit report not found" });
    }

    await writeAudit(req, "VISIT_REPORT_VIEWED", "visit_report", report.id);

    return res.status(200).json({ report });
  } catch (err) {
    console.error("Get visit report error:", err);
    return res.status(500).json({ error: "Unable to retrieve visit report" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { error: idError } = uuidSchema.validate(req.params.id);
    if (idError) return res.status(400).json({ error: "Invalid appointment ID" });

    const schema = Joi.object({
      status: Joi.string().valid(...statuses).required(),
      cancellation_reason: Joi.string().allow("", null)
    }).unknown(false);

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Invalid status update",
        details: error.details.map(item => item.message)
      });
    }

    const appointment = await db("mc_appointments")
      .where({ id: req.params.id })
      .first("id", "status");

    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (!allowedTransitions[appointment.status]?.includes(value.status)) {
      return res.status(409).json({
        error: `Invalid appointment transition: ${appointment.status} to ${value.status}`
      });
    }

    const [updated] = await db("mc_appointments")
      .where({ id: req.params.id })
      .update({
        status: value.status,
        cancellation_reason:
          value.status === "cancelled" ? value.cancellation_reason ?? null : null,
        updated_at: db.fn.now()
      })
      .returning("*");

    await writeAudit(req, "APPOINTMENT_STATUS_CHANGED", "appointment", updated.id, undefined, {
      previous_status: appointment.status,
      new_status: updated.status
    });

    return res.status(200).json({
      message: "Appointment status updated",
      appointment: updated
    });
  } catch (err) {
    console.error("Update appointment status error:", err);
    return res.status(500).json({ error: "Unable to update appointment" });
  }
});

export default router;
