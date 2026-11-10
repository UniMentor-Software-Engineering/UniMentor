
const db = require('../config/db');

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
    if (!slot || slot.status !== 'AVAILABLE') {
      throw new Error('Slot is not available');
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
