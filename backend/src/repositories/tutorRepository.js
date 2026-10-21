const db = require('../config/db');

class TutorRepository {
  async findTutors({ _subjectId, _search, limit = 10, offset = 0 }) {
    const query = `
      SELECT u.id AS user_id, u.full_name, tp.bio, tp.meeting_url
      FROM users u
      JOIN tutor_profiles tp ON tp.user_id = u.id
      WHERE u.role = 'TUTOR'
      LIMIT $1 OFFSET $2;
    `;
    const { rows } = await db.query(query, [limit, offset]);
    return rows;
  }

  async findProfileByUserId(userId) {
    const query = `SELECT tp.*, u.full_name FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id WHERE tp.user_id = $1;`;
    const { rows } = await db.query(query, [userId]);
    return rows[0] || null;
  }

  async updateProfileAndSubjects(userId, { bio, meetingUrl, hourlyRate }) {
    return await db.withTransaction(async (client) => {
      const updateQuery = `
        UPDATE tutor_profiles SET bio = COALESCE($1, bio), meeting_url = COALESCE($2, meeting_url), hourly_rate = COALESCE($3, hourly_rate)
        WHERE user_id = $4 RETURNING id;
      `;
      await client.query(updateQuery, [bio, meetingUrl, hourlyRate, userId]);
      return userId;
    });
  }
}
module.exports = new TutorRepository();