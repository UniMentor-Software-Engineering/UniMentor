
const db = require('../config/db');
const AppError = require('../utils/AppError');

// Find an availability slot by its ID
async function findSlotById(slotId) {
  const query = `
    SELECT
      id,
      tutor_id,
      time_range,
      status
    FROM availability_slots
    WHERE id = $1
  `;

  const { rows } = await db.query(query, [slotId]);

  return rows[0] || null;
}

 // CU-08: Create a booking using a database transaction
// BR-CONF-04: a student may hold at most 3 active appointments.
const MAX_ACTIVE_APPOINTMENTS = 3;

async function createBooking(slotId, studentId, studentInquiry = null, sessionType = 'STANDARD') {
  return await db.withTransaction(async (client) => {

    // Lock the student row first, so two parallel bookings of the same student
    // are serialized and cannot both pass the quota check (BR-CONF-04)
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [studentId]);

    // Lock the selected slot to prevent concurrent bookings
    const { rows } = await client.query(`
      SELECT
        id, tutor_id, time_range, status,
        lower(time_range) > CURRENT_TIMESTAMP + INTERVAL '2 hours' AS can_book
      FROM availability_slots
      WHERE id = $1
      FOR UPDATE
    `, [slotId]);

    const slot = rows[0];

    // Check whether the slot exists and is available
    if (!slot) {
      throw new AppError(404, 'Slot not found', 'SLOT_NOT_FOUND');
    }

    // CU-08 A1: another student reserved it first
    if (slot.status !== 'AVAILABLE') {
      throw new AppError(
        409,
        'This time slot has just been reserved by another student.',
        'SLOT_UNAVAILABLE'
      );
    }

    // CU-08 A3 / BR-CONF-01: minimum 2-hour advance notice
    if (!slot.can_book) {
      throw new AppError(
        409,
        'Reservations require at least 2 hours advance notice.',
        'BOOKING_TOO_LATE'
      );
    }

    // CU-08 A2 / BR-CONF-04: at most 3 active (upcoming, confirmed) appointments
    const { rows: quota } = await client.query(`
      SELECT COUNT(*)::int AS active
      FROM appointments
      WHERE student_id = $1
        AND status = 'CONFIRMED'
        AND upper(time_range) > CURRENT_TIMESTAMP
    `, [studentId]);

    if (quota[0].active >= MAX_ACTIVE_APPOINTMENTS) {
      throw new AppError(
        400,
        'You have reached the maximum limit of 3 active appointments.',
        'BOOKING_LIMIT_REACHED'
      );
    }

    // Create the appointment. The exclusion constraint no_student_appointment_overlap
    // rejects a second session of the same student at the same time (BR-CONF-05).
    let result;
    try {
      result = await client.query(`
        INSERT INTO appointments (
          slot_id, tutor_id, student_id,
          time_range, student_inquiry, session_type
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        slot.id,
        slot.tutor_id,
        studentId,
        slot.time_range,
        studentInquiry,
        sessionType
      ]);
    } catch (error) {
      if (error.code === '23P01') {
        throw new AppError(
          409,
          'You already have another session booked at this time.',
          'STUDENT_OVERLAP'
        );
      }
      throw error;
    }

    // Mark the slot as booked
    await client.query(`
      UPDATE availability_slots
      SET status = 'BOOKED'
      WHERE id = $1
    `, [slotId]);

    return result.rows[0];
  });
}


 // Find an appointment by its ID
async function findAppointmentById(appointmentId) {
  const { rows } = await db.query(`
    SELECT
      id,
      slot_id,
      tutor_id,
      student_id,
      time_range,
      status
    FROM appointments
    WHERE id = $1
  `, [appointmentId]);

  return rows[0] || null;
}


 // Cancel an appointment within a database transaction
async function cancelAppointment(appointmentId, userId, reason = null) {
  return await db.withTransaction(async (client) => {

    // Lock the appointment to prevent concurrent modifications
    
    const { rows } = await client.query(`
      SELECT
      id,
      slot_id,
      tutor_id,
      student_id,
      time_range,
      lower(time_range) AS starts_at,
      status
      FROM appointments
      WHERE id = $1
      FOR UPDATE
      `, [appointmentId]);


    const appointment = rows[0];

    // Check whether the appointment exists
    if (!appointment) {
      throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
    }

    // Verify that the user is a participant
    if (appointment.student_id !== userId && appointment.tutor_id !== userId) {
      throw new AppError(403, 'Not authorized to cancel this appointment', 'FORBIDDEN');
    }

    // Only confirmed appointments can be cancelled
    if (appointment.status !== 'CONFIRMED') {
      throw new AppError(409, 'Appointment cannot be cancelled', 'INVALID_STATUS');
    }

    // A session that has already started can no longer be cancelled
    if (new Date(appointment.starts_at).getTime() <= Date.now()) {
      throw new AppError(409, 'This session has already started and cannot be cancelled', 'SESSION_STARTED');
    }

    
    // Calculate the time remaining before the session
    const startsAt = new Date(appointment.starts_at);
    const hoursUntilStart = (startsAt.getTime() - Date.now()) / (1000 * 60 * 60);

    // A cancellation is late when less than 4 hours remain
    const isLate = hoursUntilStart < 4;

    // Update the appointment status
    const result = await client.query(`
      UPDATE appointments
      SET status = 'CANCELLED',
          is_late_cancellation = $2,
          cancelled_by = $3,
          cancelled_at = CURRENT_TIMESTAMP,
          cancellation_reason = $4
      WHERE id = $1
      RETURNING *
    `, [appointmentId, isLate, userId, reason]);

    if (isLate) {
      // Record the late cancellation on the user's profile
      await client.query(`
        UPDATE users
        SET late_cancellation_count = late_cancellation_count + 1
        WHERE id = $1
      `, [userId]);

      // Keep the slot closed for late cancellations
      await client.query(`
        UPDATE availability_slots
        SET status = 'UNAVAILABLE'
        WHERE id = $1
      `, [appointment.slot_id]);
    } else {
      // Make the slot available again
      await client.query(`
        UPDATE availability_slots
        SET status = 'AVAILABLE'
        WHERE id = $1
      `, [appointment.slot_id]);
    }

    return result.rows[0];
  });
}


 // CU-04: Check whether a tutor can publish availability slots
async function canTutorPublishSlots(tutorId) {
  const { rows } = await db.query(`
    SELECT EXISTS (
      SELECT 1
      FROM users u
      JOIN tutor_profiles tp ON tp.user_id = u.id
      WHERE u.id = $1
        AND u.role = 'TUTOR'
        AND u.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM tutor_subjects ts
          WHERE ts.tutor_id = u.id
        )
    ) AS can_publish
  `, [tutorId]);

  return rows[0].can_publish;
}


 // CU-04: Publish valid availability slots for a tutor
async function publishAvailabilitySlots(tutorId, slots) {
  const published = [];
  const skipped = [];

  for (const slot of slots) {
    // Reject slots that start in the past
    if (new Date(slot.startTime).getTime() <= Date.now()) {
      skipped.push({
        ...slot,
        reason: 'PAST_SLOT'
      });
      continue;
    }

    try {
      // Insert the slot if it does not overlap existing availability
      const { rows } = await db.query(`
        INSERT INTO availability_slots (
          tutor_id,
          time_range,
          status
        )
        VALUES (
          $1,
          tstzrange($2::timestamptz, $3::timestamptz, '[)'),
          'AVAILABLE'
        )
        RETURNING id, tutor_id, time_range, status
      `, [
        tutorId,
        slot.startTime,
        slot.endTime
      ]);

      published.push(rows[0]);

    } catch (error) {
      // PostgreSQL exclusion violation: overlapping availability
      if (error.code === '23P01') {
        skipped.push({
          ...slot,
          reason: 'OVERLAPPING_SLOT'
        });
      } else {
        throw error;
      }
    }
  }

  return {
    published,
    skipped
  };
}


 // CU-05: Block an available slot owned by the authenticated tutor
async function blockAvailabilitySlot(slotId, tutorId) {
  return await db.withTransaction(async (client) => {

    // Lock the slot to prevent concurrent booking or modification
    const { rows } = await client.query(`
      SELECT id, tutor_id, status
      FROM availability_slots
      WHERE id = $1
      FOR UPDATE
    `, [slotId]);

    const slot = rows[0];

    // Check whether the slot exists
    if (!slot) {
      throw new AppError(404, 'Slot not found', 'SLOT_NOT_FOUND');
    }

    // Verify that the slot belongs to the tutor
    if (slot.tutor_id !== tutorId) {
      throw new AppError(403, 'You do not own this slot', 'FORBIDDEN');
    }

    // Prevent removing an already booked slot
    if (slot.status === 'BOOKED') {
      throw new AppError(
        409,
        'This slot has just been booked. Please cancel it from your appointments dashboard.',
        'SLOT_ALREADY_BOOKED'
      );
    }

    // Only available slots can be blocked
    if (slot.status !== 'AVAILABLE') {
      throw new AppError(
        409,
        'Slot is not available for removal',
        'INVALID_SLOT_STATUS'
      );
    }

    // Mark the slot as unavailable
    const result = await client.query(`
      UPDATE availability_slots
      SET status = 'UNAVAILABLE'
      WHERE id = $1
      RETURNING id, tutor_id, status
    `, [slotId]);

    return result.rows[0];
  });
}


 // CU-07: Find a tutor's available slots with at least 2 hours advance notice
async function findAvailableSlotsByTutor(tutorId) {
  const { rows } = await db.query(`
    SELECT
      id,
      tutor_id,
      lower(time_range) AS start_time,
      upper(time_range) AS end_time,
      status
    FROM availability_slots
    WHERE tutor_id = $1
      AND status = 'AVAILABLE'
      AND lower(time_range) > CURRENT_TIMESTAMP + INTERVAL '2 hours'
    ORDER BY lower(time_range) ASC
  `, [tutorId]);

  return rows;
}


 // CU-09 / CU-08 step 9: appointments of a student or tutor for their dashboard.
// scope 'upcoming' = confirmed sessions that have not ended; 'past' = everything else.
// The meeting link is only returned to participants of a confirmed session.
async function findAppointmentsForUser(userId, scope) {
  const upcoming = scope === 'upcoming';
  const { rows } = await db.query(`
    SELECT
      a.id,
      a.status,
      a.session_type,
      lower(a.time_range) AS start_time,
      upper(a.time_range) AS end_time,
      a.student_inquiry,
      a.is_late_cancellation,
      a.cancellation_reason,
      a.cancelled_at,
      (a.cancelled_by IS NOT DISTINCT FROM $1::uuid) AS cancelled_by_me,
      CASE WHEN a.student_id = $1 THEN 'STUDENT' ELSE 'TUTOR' END AS my_role,
      t.id AS tutor_id,
      t.first_name AS tutor_first_name,
      t.last_name AS tutor_last_name,
      s.id AS student_id,
      s.first_name AS student_first_name,
      s.last_name AS student_last_name,
      CASE WHEN a.status = 'CONFIRMED' THEN tp.meeting_url END AS meeting_url
    FROM appointments a
    JOIN users t ON t.id = a.tutor_id
    JOIN users s ON s.id = a.student_id
    LEFT JOIN tutor_profiles tp ON tp.user_id = a.tutor_id
    WHERE (a.student_id = $1 OR a.tutor_id = $1)
      AND (
        ($2 AND a.status = 'CONFIRMED' AND upper(a.time_range) > CURRENT_TIMESTAMP)
        OR
        (NOT $2 AND (a.status <> 'CONFIRMED' OR upper(a.time_range) <= CURRENT_TIMESTAMP))
      )
    ORDER BY
      CASE WHEN $2 THEN lower(a.time_range) END ASC,
      CASE WHEN NOT $2 THEN lower(a.time_range) END DESC
    LIMIT 100
  `, [userId, upcoming]);

  return rows;
}


 // CU-04 / CU-05: a tutor's own slots in a time window, in every status,
// for the availability management calendar.
async function findSlotsByTutorInRange(tutorId, from, to) {
  const { rows } = await db.query(`
    SELECT
      sl.id,
      lower(sl.time_range) AS start_time,
      upper(sl.time_range) AS end_time,
      sl.status,
      st.first_name AS student_first_name,
      st.last_name AS student_last_name
    FROM availability_slots sl
    LEFT JOIN appointments a
      ON a.slot_id = sl.id AND a.status <> 'CANCELLED'
    LEFT JOIN users st ON st.id = a.student_id
    WHERE sl.tutor_id = $1
      AND sl.time_range && tstzrange($2::timestamptz, $3::timestamptz, '[)')
    ORDER BY lower(sl.time_range) ASC
  `, [tutorId, from, to]);

  return rows;
}


module.exports = {
  findSlotById,
  createBooking,
  findAppointmentById,
  cancelAppointment,
  canTutorPublishSlots,
  publishAvailabilitySlots,
  blockAvailabilitySlot,
  findAvailableSlotsByTutor,
  findAppointmentsForUser,
  findSlotsByTutorInRange,
  MAX_ACTIVE_APPOINTMENTS
};
