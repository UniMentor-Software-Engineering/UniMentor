const pool = require('../config/db');

const findTutors = async ({ subjectId, search, limit = 10, offset = 0 }) => {
  const conditions = ["u.role = 'TUTOR'", "u.status = 'ACTIVE'"];
  const params = [];

  if (subjectId) {
    params.push(subjectId);
    conditions.push(`EXISTS (
      SELECT 1 FROM tutor_subjects ts_sub 
      WHERE ts_sub.tutor_id = u.id AND ts_sub.subject_id = $${params.length}
    )`);
  }

  if (search) {
    params.push(`%${search}%`);
    const searchParam = `$${params.length}`;
    conditions.push(`(
      u.first_name ILIKE ${searchParam} OR 
      u.last_name ILIKE ${searchParam} OR 
      tp.bio ILIKE ${searchParam} OR
      EXISTS (
        SELECT 1 FROM tutor_subjects ts2
        JOIN subjects s2 ON ts2.subject_id = s2.id
        WHERE ts2.tutor_id = u.id AND s2.name ILIKE ${searchParam}
      )
    )`);
  }

  // Regla de negocio: al menos una asignatura asociada
  conditions.push(`EXISTS (SELECT 1 FROM tutor_subjects ts3 WHERE ts3.tutor_id = u.id)`);

  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const query = `
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      tp.bio,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
        ) FILTER (WHERE s.id IS NOT NULL), '[]'
      ) AS subjects,
      (
        SELECT lower(av.time_range)
        FROM availability_slots av
        WHERE av.tutor_id = u.id 
          AND av.status = 'AVAILABLE' 
          AND lower(av.time_range) > CURRENT_TIMESTAMP
        ORDER BY lower(av.time_range) ASC
        LIMIT 1
      ) AS next_available_slot
    FROM users u
    LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
    JOIN tutor_subjects ts ON u.id = ts.tutor_id
    JOIN subjects s ON ts.subject_id = s.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY u.id, u.first_name, u.last_name, tp.bio
    ORDER BY next_available_slot ASC NULLS LAST, u.first_name ASC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const { rows } = await pool.query(query, params);
  return rows;
};

const findTutorById = async (tutorId) => {
  const query = `
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      tp.bio,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'department', s.department)
        ) FILTER (WHERE s.id IS NOT NULL), '[]'
      ) AS subjects
    FROM users u
    LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
    LEFT JOIN tutor_subjects ts ON u.id = ts.tutor_id
    LEFT JOIN subjects s ON ts.subject_id = s.id
    WHERE u.id = $1 AND u.role = 'TUTOR' AND u.status = 'ACTIVE'
    GROUP BY u.id, u.first_name, u.last_name, tp.bio;
  `;
  const { rows } = await pool.query(query, [tutorId]);
  return rows[0] || null;
};

const updateProfileAndSubjects = async (userId, { bio, meetingUrl, subjectIds }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert del perfil
    await client.query(`
      INSERT INTO tutor_profiles (user_id, bio, meeting_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE
      SET bio = EXCLUDED.bio,
          meeting_url = EXCLUDED.meeting_url,
          updated_at = CURRENT_TIMESTAMP
    `, [userId, bio, meetingUrl]);

    // 2. Reemplazo de asignaturas
    await client.query('DELETE FROM tutor_subjects WHERE tutor_id = $1', [userId]);

    for (const subId of subjectIds) {
      await client.query(
        'INSERT INTO tutor_subjects (tutor_id, subject_id) VALUES ($1, $2)',
        [userId, subId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const checkSubjectsExist = async (subjectIds) => {
  const { rows } = await pool.query(
    'SELECT id FROM subjects WHERE id = ANY($1::uuid[])',
    [subjectIds]
  );
  return rows.length === subjectIds.length;
};

module.exports = {
  findTutors,
  findTutorById,
  updateProfileAndSubjects,
  checkSubjectsExist
};