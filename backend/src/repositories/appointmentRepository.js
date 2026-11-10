
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

 // Create a booking using a database transaction
async function createBooking(slotId, studentId, studentInquiry = null) {
  return await db.withTransaction(async (client) => {

    // Lock the selected slot to prevent concurrent bookings
    const { rows } = await client.query(`
      SELECT id, tutor_id, time_range, status
      FROM availability_slots
      WHERE id = $1
      FOR UPDATE
    `, [slotId]);

    const slot = rows[0];

    // Check whether the slot exists and is available
    if (!slot) {
      throw new AppError(404, 'Slot not found', 'SLOT_NOT_FOUND');
    }

    if (slot.status !== 'AVAILABLE') {
      throw new AppError(409, 'Slot is not available', 'SLOT_UNAVAILABLE');
    }

    // Create the appointment
    const result = await client.query(`
      INSERT INTO appointments (
        slot_id, tutor_id, student_id,
        time_range, student_inquiry
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      slot.id,
      slot.tutor_id,
      studentId,
      slot.time_range,
      studentInquiry
    ]);

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
async function cancelAppointment(appointmentId, userId) {
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
          cancelled_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [appointmentId, isLate, userId]);

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


module.exports = {
  findSlotById,
  createBooking,
  findAppointmentById,
  cancelAppointment
};
