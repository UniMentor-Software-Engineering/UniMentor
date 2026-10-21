-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Tipos enumerados
CREATE TYPE user_role AS ENUM ('STUDENT', 'TUTOR', 'ADMIN');
CREATE TYPE slot_status AS ENUM ('AVAILABLE', 'BOOKED', 'BLOCKED');
CREATE TYPE appointment_status AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE session_type AS ENUM ('QUICK_CHECK', 'STANDARD', 'DEEP_DIVE');

-- 1. Tabla de Usuarios
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Perfiles de Tutor (CU-03)
CREATE TABLE tutor_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT,
    meeting_url VARCHAR(500) NOT NULL,
    hourly_rate NUMERIC(10, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Catálogo de Asignaturas
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT
);

-- 4. Tabla intermedia M:N (tutor_subjects)
CREATE TABLE tutor_subjects (
    tutor_profile_id UUID NOT NULL REFERENCES tutor_profiles(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (tutor_profile_id, subject_id)
);

-- 5. Franjas horarias (CU-04 / CU-05) con restricción EXCLUDE para regla BR-CONF-05
CREATE TABLE availability_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    time_range TSTZRANGE NOT NULL,
    status slot_status DEFAULT 'AVAILABLE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT no_tutor_slot_overlap EXCLUDE USING gist (
        tutor_id WITH =,
        time_range WITH &&
    )
);

-- 6. Reservas y Citas (CU-08 / CU-09)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slot_id UUID NOT NULL REFERENCES availability_slots(id) ON DELETE RESTRICT,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    time_range TSTZRANGE NOT NULL,
    session_type session_type NOT NULL DEFAULT 'STANDARD',
    status appointment_status DEFAULT 'CONFIRMED',
    cancellation_reason TEXT,
    notes TEXT,
    rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
    reminder_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT no_student_appointment_overlap EXCLUDE USING gist (
        student_id WITH =,
        time_range WITH &&
    )
);

-- Índices estratégicos para optimizar la búsqueda (CU-06)
CREATE INDEX idx_tutor_subjects_subject ON tutor_subjects(subject_id);
CREATE INDEX idx_availability_slots_tutor_range ON availability_slots USING gist (tutor_id, time_range);
CREATE INDEX idx_appointments_student ON appointments(student_id);
CREATE INDEX idx_appointments_tutor ON appointments(tutor_id);