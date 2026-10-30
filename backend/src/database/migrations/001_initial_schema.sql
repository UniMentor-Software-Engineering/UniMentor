-- Habilitar extensión btree_gist para restricciones EXCLUDE con tipos escalares
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Tipos ENUM
CREATE TYPE user_role AS ENUM ('STUDENT', 'TUTOR', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'BOOKED', 'UNAVAILABLE');
CREATE TYPE appointment_status AS ENUM ('CONFIRMED', 'COMPLETED', 'CANCELLED');

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Tabla users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    status user_status NOT NULL DEFAULT 'ACTIVE',
    failed_login_count INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    late_cancellation_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Tabla subjects
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    department VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_subjects_updated_at
    BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Tabla tutor_profiles
CREATE TABLE tutor_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    meeting_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trg_tutor_profiles_updated_at
    BEFORE UPDATE ON tutor_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Tabla intermedia tutor_subjects
CREATE TABLE tutor_subjects (
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tutor_id, subject_id)
);

-- 5. Tabla availability_slots
CREATE TABLE availability_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_range TSTZRANGE NOT NULL,
    status slot_status NOT NULL DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Exigir bloques exactos de 60 minutos (BR-CONF-03)
    CONSTRAINT chk_slot_duration_60m CHECK (upper(time_range) - lower(time_range) = INTERVAL '60 minutes'),
    
    -- Evitar solapamiento de slots del mismo tutor
    CONSTRAINT no_tutor_slot_overlap EXCLUDE USING gist (
        tutor_id WITH =,
        time_range WITH &&
    ),

    -- Para permitir FK compuesta desde appointments
    CONSTRAINT uq_slot_tutor_range UNIQUE (id, tutor_id, time_range)
);

CREATE TRIGGER trg_availability_slots_updated_at
    BEFORE UPDATE ON availability_slots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Tabla appointments
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID NOT NULL,
    tutor_id UUID NOT NULL,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_range TSTZRANGE NOT NULL,
    status appointment_status NOT NULL DEFAULT 'CONFIRMED',
    student_inquiry TEXT,
    tutor_notes TEXT,
    student_feedback TEXT,
    is_late_cancellation BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_by UUID REFERENCES users(id),
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Garantizar coherencia entre el slot y la cita
    FOREIGN KEY (slot_id, tutor_id, time_range)
        REFERENCES availability_slots (id, tutor_id, time_range) ON DELETE RESTRICT,

    -- Impedir citas simultáneas para un mismo estudiante salvo que estén canceladas
    CONSTRAINT no_student_appointment_overlap EXCLUDE USING gist (
        student_id WITH =,
        time_range WITH &&
    ) WHERE (status <> 'CANCELLED')
);

-- Impedir dos citas activas en el mismo slot
CREATE UNIQUE INDEX uq_appointments_active_slot
    ON appointments (slot_id) WHERE status <> 'CANCELLED';

CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Tabla audit_logs (append-only)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100) NOT NULL,
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Proteger audit_logs frente a modificaciones y borrados
CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only: UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_mutation();