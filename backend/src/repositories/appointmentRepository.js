
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

module.exports = {
  findSlotById,
  createBooking
};
