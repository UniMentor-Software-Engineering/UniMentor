-- Secondary indexes for the main read paths.
-- Already covered without extra indexes: the primary keys, UNIQUE(email), UNIQUE(code),
-- the GiST indexes created by the two EXCLUDE constraints and uq_appointments_active_slot.

-- CU-06: find the tutors of a subject (the primary key of tutor_subjects starts with tutor_id).
CREATE INDEX idx_tutor_subjects_subject ON tutor_subjects (subject_id);

-- Personal dashboards: "my appointments" as a student or as a tutor (NFR-01).
CREATE INDEX idx_appointments_student ON appointments (student_id);
CREATE INDEX idx_appointments_tutor ON appointments (tutor_id);

-- CU-06 and the booking calendar: the next free slot of a tutor.
CREATE INDEX idx_availability_slots_available
    ON availability_slots (tutor_id, lower(time_range))
    WHERE status = 'AVAILABLE';
