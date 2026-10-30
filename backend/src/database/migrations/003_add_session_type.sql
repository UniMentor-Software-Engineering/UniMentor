-- Session type chosen by the student when booking (CU-08, BR-CONF-03).
-- It sets the intended length of the conversation (Quick Check 5 min, Standard 30 min,
-- Deep Dive 60 min) but never the block size: every appointment still takes a 60-minute slot.
CREATE TYPE session_type AS ENUM ('QUICK_CHECK', 'STANDARD', 'DEEP_DIVE');

ALTER TABLE appointments
    ADD COLUMN session_type session_type NOT NULL DEFAULT 'STANDARD';
