-- Columns that Phase 1 requires and migration 001 did not include.
ALTER TABLE appointments
    -- CU-10: set to TRUE only after the email provider accepts the reminder.
    ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    -- CU-12: rating from 1 to 5. NULL means not rated yet, which lets the service allow one rating per session.
    ADD COLUMN student_rating SMALLINT CHECK (student_rating BETWEEN 1 AND 5),
    -- CU-09, step 3: optional reason given when cancelling.
    ADD COLUMN cancellation_reason VARCHAR(500);

-- CU-10: the scheduler looks for the reminders still pending every 10 minutes.
CREATE INDEX idx_appointments_pending_reminder
    ON appointments (lower(time_range))
    WHERE status = 'CONFIRMED' AND NOT reminder_sent;
