const db = require('../config/db');

async function findTutors({ subjectId, search, limit = 10, offset = 0 } = {}) {
  const conditions = ["u.role = 'TUTOR'", "u.status = 'ACTIVE'"];
  const params = [];
  const joins = [
    'LEFT JOIN tutor_profiles tp ON u.id = tp.user_id',
    'JOIN tutor_subjects ts ON u.id = ts.tutor_id',
    'JOIN subjects s ON ts.subject_id = s.id',
  ];

  if (subjectId) {
    params.push(subjectId);
    joins.push('JOIN tutor_subjects ts_filter ON u.id = ts_filter.tutor_id');
    conditions.push(`ts_filter.subject_id = $${params.length}`);
  }

  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    params.push(`%${escaped}%`);
    const searchParam = `$${params.length}`;
    joins.push('LEFT JOIN tutor_subjects ts_s ON u.id = ts_s.tutor_id');
    joins.push('LEFT JOIN subjects s_search ON ts_s.subject_id = s_search.id');
    // unaccent (migration 004) on both sides: "garcia" matches "García" and vice versa.
    const term = `unaccent(${searchParam})`;
    conditions.push(`(unaccent(u.first_name) ILIKE ${term} OR unaccent(u.last_name) ILIKE ${term} OR unaccent(tp.bio) ILIKE ${term} OR unaccent(s_search.name) ILIKE ${term} OR s_search.code ILIKE ${searchParam})`);
  }

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
    ${joins.join('\n    ')}
    WHERE ${conditions.join(' AND ')}
    GROUP BY u.id, u.first_name, u.last_name, tp.bio
    ORDER BY next_available_slot ASC NULLS LAST, u.first_name ASC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const { rows } = await db.query(query, params);
  return rows;
}

async function findTutorById(tutorId) {
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
  const { rows } = await db.query(query, [tutorId]);
  return rows[0] || null;
}

// CU-03, step 2: the signed-in tutor's own profile, including the meeting link,
// which the public profile does not show. A tutor without a profile yet gets nulls.
async function findOwnProfile(userId) {
  const query = `
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      tp.bio,
      tp.meeting_url,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name)
        ) FILTER (WHERE s.id IS NOT NULL), '[]'
      ) AS subjects
    FROM users u
    LEFT JOIN tutor_profiles tp ON u.id = tp.user_id
    LEFT JOIN tutor_subjects ts ON u.id = ts.tutor_id
    LEFT JOIN subjects s ON ts.subject_id = s.id
    WHERE u.id = $1
    GROUP BY u.id, u.first_name, u.last_name, tp.bio, tp.meeting_url;
  `;
  const { rows } = await db.query(query, [userId]);
  return rows[0] || null;
}

async function updateProfileAndSubjects(userId, { bio, meetingUrl, subjectIds }) {
  return await db.withTransaction(async (client) => {
    // 1. Upsert tutor profile
    await client.query(`
      INSERT INTO tutor_profiles (user_id, bio, meeting_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE
      SET bio = EXCLUDED.bio,
          meeting_url = EXCLUDED.meeting_url,
          updated_at = CURRENT_TIMESTAMP
    `, [userId, bio, meetingUrl]);

    // 2. Clear previous subject assignments
    await client.query('DELETE FROM tutor_subjects WHERE tutor_id = $1', [userId]);

    // 3. Assign new subjects
    await client.query(
      'INSERT INTO tutor_subjects (tutor_id, subject_id) SELECT $1, unnest($2::uuid[])',
      [userId, subjectIds]
    );
  });
}

async function checkSubjectsExist(subjectIds) {
  const { rows } = await db.query(
    'SELECT id FROM subjects WHERE id = ANY($1::uuid[])',
    [subjectIds]
  );
  return rows.length === subjectIds.length;
}

module.exports = {
  findTutors,
  findTutorById,
  findOwnProfile,
  updateProfileAndSubjects,
  checkSubjectsExist,
};