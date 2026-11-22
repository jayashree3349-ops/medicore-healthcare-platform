-- MediCore initial PostgreSQL schema
-- PostgreSQL 15

CREATE TABLE IF NOT EXISTS mc_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (
        role IN ('patient', 'clinician', 'nurse', 'admin', 'superadmin')
    ),
    phone VARCHAR(30),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_encrypted TEXT,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES mc_users(id),
    mrn VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(30),
    blood_group VARCHAR(5),
    phone VARCHAR(30),
    email VARCHAR(255),
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    emergency_contact JSONB NOT NULL DEFAULT '{}'::jsonb,
    fhir_resource JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES mc_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES mc_users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES mc_patients(id) ON DELETE CASCADE,
    allergen VARCHAR(255) NOT NULL,
    reaction TEXT,
    severity VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    recorded_by UUID REFERENCES mc_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES mc_patients(id) ON DELETE CASCADE,
    condition_name VARCHAR(255) NOT NULL,
    icd10_code VARCHAR(20),
    clinical_status VARCHAR(30) NOT NULL DEFAULT 'active',
    onset_date DATE,
    recorded_by UUID REFERENCES mc_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES mc_patients(id) ON DELETE CASCADE,
    medication_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    route VARCHAR(100),
    frequency VARCHAR(100),
    start_date DATE,
    end_date DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    prescribed_by UUID REFERENCES mc_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES mc_patients(id),
    clinician_id UUID REFERENCES mc_users(id),
    created_by UUID REFERENCES mc_users(id),
    appointment_type VARCHAR(100),
    reason TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'requested'
        CHECK (status IN (
            'requested',
            'scheduled',
            'confirmed',
            'checked_in',
            'in_progress',
            'completed',
            'cancelled'
        )),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    cancellation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (scheduled_end > scheduled_start)
);

CREATE TABLE IF NOT EXISTS mc_visit_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL UNIQUE
        REFERENCES mc_appointments(id),
    patient_id UUID NOT NULL REFERENCES mc_patients(id),
    clinician_id UUID REFERENCES mc_users(id),
    chief_complaint TEXT,
    clinical_notes TEXT,
    diagnosis JSONB NOT NULL DEFAULT '[]'::jsonb,
    treatment_plan TEXT,
    vital_signs JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mc_appointment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL
        REFERENCES mc_appointments(id) ON DELETE CASCADE,
    reminder_type VARCHAR(30) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_mc_patients_name
    ON mc_patients(last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_mc_refresh_tokens_user
    ON mc_refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_mc_audit_logs_created
    ON mc_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mc_audit_logs_resource
    ON mc_audit_logs(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_mc_allergies_patient
    ON mc_allergies(patient_id);

CREATE INDEX IF NOT EXISTS idx_mc_conditions_patient
    ON mc_conditions(patient_id);

CREATE INDEX IF NOT EXISTS idx_mc_medications_patient
    ON mc_medications(patient_id);

CREATE INDEX IF NOT EXISTS idx_mc_appointments_patient
    ON mc_appointments(patient_id, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_mc_appointments_clinician
    ON mc_appointments(clinician_id, scheduled_start);

CREATE INDEX IF NOT EXISTS idx_mc_appointments_status
    ON mc_appointments(status);

CREATE INDEX IF NOT EXISTS idx_mc_reminders_pending
    ON mc_appointment_reminders(scheduled_at)
    WHERE status = 'pending';
