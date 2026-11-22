import { Router } from "express";
import db from "../db.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize("clinician", "nurse", "admin", "superadmin"));

router.get("/overview", async (_req, res) => {
  try {
    const [patients, appointments, confirmed, awaiting] = await Promise.all([
      db("mc_patients").count({ total: "id" }).first(),
      db("mc_appointments").count({ total: "id" }).first(),
      db("mc_appointments").where({ status: "confirmed" }).count({ total: "id" }).first(),
      db("mc_appointments").whereIn("status", ["requested", "scheduled"]).count({ total: "id" }).first()
    ]);

    return res.json({
      total_patients: Number(patients?.total || 0),
      total_appointments: Number(appointments?.total || 0),
      confirmed_appointments: Number(confirmed?.total || 0),
      awaiting_action: Number(awaiting?.total || 0)
    });
  } catch (err: any) {
    console.error("Analytics overview failed:", err.message);
    return res.status(500).json({ error: "Unable to retrieve analytics" });
  }
});

router.get("/demographics", async (_req, res) => {
  try {
    const genders = await db("mc_patients")
      .select(db.raw("COALESCE(NULLIF(gender, ''), 'unknown') AS gender"))
      .count({ count: "id" })
      .groupByRaw("COALESCE(NULLIF(gender, ''), 'unknown')")
      .orderBy("gender");

    const ageGroups = await db("mc_patients")
      .select(db.raw(`
        CASE
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 18 THEN '0-17'
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 35 THEN '18-34'
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 50 THEN '35-49'
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 65 THEN '50-64'
          ELSE '65+'
        END AS age_group
      `))
      .count({ count: "id" })
      .groupByRaw(`
        CASE
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 18 THEN '0-17'
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 35 THEN '18-34'
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 50 THEN '35-49'
          WHEN DATE_PART('year', AGE(CURRENT_DATE, date_of_birth)) < 65 THEN '50-64'
          ELSE '65+'
        END
      `)
      .orderBy("age_group");

    return res.json({ gender_distribution: genders, age_distribution: ageGroups });
  } catch (err: any) {
    console.error("Patient demographics failed:", err.message);
    return res.status(500).json({ error: "Unable to retrieve demographics" });
  }
});

router.get("/icd10", async (_req, res) => {
  try {
    const conditions = await db("mc_conditions")
      .select("icd10_code", "condition_name")
      .count({ count: "id" })
      .whereNotNull("icd10_code")
      .groupBy("icd10_code", "condition_name")
      .orderBy("icd10_code");

    return res.json({ count: conditions.length, conditions });
  } catch (err: any) {
    console.error("ICD-10 analytics failed:", err.message);
    return res.status(500).json({ error: "Unable to retrieve ICD-10 statistics" });
  }
});

export default router;
