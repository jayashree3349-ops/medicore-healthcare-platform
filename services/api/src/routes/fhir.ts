import { Router } from "express";
import db from "../db.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

router.use(authenticate, authorize("clinician", "nurse", "admin", "superadmin"));

const MRN_SYSTEM = "urn:medicore:mrn";

function toFhirPatient(row: any) {
  const gender = ["male", "female", "other", "unknown"].includes(
    String(row.gender || "").toLowerCase()
  ) ? String(row.gender).toLowerCase() : "unknown";

  const telecom = [];
  if (row.phone) telecom.push({ system: "phone", value: row.phone });
  if (row.email) telecom.push({ system: "email", value: row.email });

  const address = row.address && typeof row.address === "object"
    ? [{
        use: "home",
        line: row.address.line ? [row.address.line] : [],
        city: row.address.city,
        state: row.address.state,
        postalCode: row.address.postalCode || row.address.postal_code,
        country: row.address.country
      }]
    : [];

  return {
    resourceType: "Patient",
    id: row.id,
    meta: {
      lastUpdated: row.updated_at
        ? new Date(row.updated_at).toISOString()
        : undefined
    },
    identifier: [{
      use: "usual",
      system: MRN_SYSTEM,
      value: row.mrn
    }],
    active: true,
    name: [{
      use: "official",
      family: row.last_name,
      given: [row.first_name]
    }],
    telecom,
    gender,
    birthDate: new Date(row.date_of_birth).toISOString().slice(0, 10),
    address
  };
}

function outcome(code: string, diagnostics: string) {
  return {
    resourceType: "OperationOutcome",
    issue: [{
      severity: "error",
      code,
      diagnostics
    }]
  };
}

router.get("/metadata", (_req, res) => {
  res.type("application/fhir+json").json({
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["application/fhir+json", "application/json"],
    rest: [{
      mode: "server",
      resource: [{
        type: "Patient",
        interaction: [
          { code: "read" },
          { code: "search-type" }
        ],
        searchParam: [{
          name: "identifier",
          type: "token",
          documentation: "Search patients by medical record number (MRN)"
        }]
      }]
    }]
  });
});

router.get("/Patient", async (req, res) => {
  const identifier = typeof req.query.identifier === "string"
    ? req.query.identifier
    : "";

  if (!identifier) {
    return res.status(400).type("application/fhir+json").json(
      outcome("required", "The identifier search parameter is required")
    );
  }

  const mrn = identifier.includes("|")
    ? identifier.split("|").pop()
    : identifier;

  try {
    const rows = await db("mc_patients").where({ mrn }).limit(100);
    const entries = rows.map((row) => ({
      fullUrl: `Patient/${row.id}`,
      resource: toFhirPatient(row),
      search: { mode: "match" }
    }));

    return res.type("application/fhir+json").json({
      resourceType: "Bundle",
      type: "searchset",
      total: entries.length,
      entry: entries
    });
  } catch (err: any) {
    console.error("FHIR Patient search failed:", err.message);
    return res.status(500).type("application/fhir+json").json(
      outcome("exception", "Unable to search patients")
    );
  }
});

router.get("/Patient/:id", async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).type("application/fhir+json").json(
      outcome("invalid", "Patient ID must be a valid UUID")
    );
  }

  try {
    const patient = await db("mc_patients").where({ id: req.params.id }).first();

    if (!patient) {
      return res.status(404).type("application/fhir+json").json(
        outcome("not-found", "Patient not found")
      );
    }

    return res.type("application/fhir+json").json(toFhirPatient(patient));
  } catch (err: any) {
    console.error("FHIR Patient read failed:", err.message);
    return res.status(500).type("application/fhir+json").json(
      outcome("exception", "Unable to retrieve patient")
    );
  }
});

export default router;
