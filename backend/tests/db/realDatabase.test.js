// End-to-end tests with the real Express app and a real PostgreSQL: the mocked suite cannot
// detect a wrong query or a missing column. P4's concurrency test (NFR-03) belongs here too.
//
// Usage: TEST_DATABASE_URL=postgres://... npm run test:db
// WARNING: the seed empties that database. It must not be the one you develop with.
const { execFileSync } = require('child_process');
const path = require('path');
const request = require('supertest');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('Set TEST_DATABASE_URL to an empty database that can be erased.');
}
// Before loading the app: dotenv never overrides a variable that is already set.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DB_SSL = 'false';
process.env.ALLOWED_EMAIL_DOMAINS = 'myuax.com,unimentor.edu';

const app = require('../../src/app');
const db = require('../../src/config/db');

const BACKEND = path.join(__dirname, '..', '..');
const PASSWORD = 'Password123!';
const LAURA = 'b0000000-0000-0000-0000-000000000001';
const CARLOS = 'b0000000-0000-0000-0000-000000000002';
const DIEGO = 'c0000000-0000-0000-0000-000000000001';
const ADMIN = 'a0000000-0000-0000-0000-000000000001';
const FREE_CARLOS_SLOT = 'e0000000-0000-0000-0000-000000000004';
const SOFT301 = 'd0000000-0000-0000-0000-000000000003';

function runScript(name, extraEnv = {}) {
  return execFileSync('node', [`src/database/${name}.js`], {
    cwd: BACKEND,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const post = (url) => request(app).post(url).set('X-Requested-With', 'XMLHttpRequest');
const put = (url) => request(app).put(url).set('X-Requested-With', 'XMLHttpRequest');

async function signIn(email, password = PASSWORD) {
  const res = await post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0].split(';')[0];
}

const rejectedWith = (promise) => promise.then(
  () => { throw new Error('The database accepted the row'); },
  (err) => err.constraint || err.code,
);

beforeAll(() => {
  runScript('migrate');
});

beforeEach(() => {
  runScript('seed');
});

afterAll(() => db.pool.end());

describe('migrations and health', () => {
  it('can run again without changing anything', () => {
    expect(runScript('migrate')).toMatch(/Skipping already applied migration/);
  });

  it('reports the database and its tables as ready', async () => {
    const res = await request(app).get('/api/health/db');
    expect(res.status).toBe(200);
  });

  it('has the columns that CU-09, CU-10 and CU-12 need', async () => {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments'",
    );
    expect(rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(['reminder_sent', 'student_rating', 'cancellation_reason']),
    );
  });
});

describe('schema constraints', () => {
  const FUTURE = "tstzrange('2031-01-01 10:00+00', '2031-01-01 11:00+00')";

  it('rejects a slot that is not 60 minutes long (BR-CONF-03)', async () => {
    await expect(rejectedWith(db.query(
      `INSERT INTO availability_slots (tutor_id, time_range)
       VALUES ($1, tstzrange('2031-01-01 10:00+00', '2031-01-01 10:30+00'))`,
      [LAURA],
    ))).resolves.toBe('chk_slot_duration_60m');
  });

  it('rejects overlapping slots of one tutor (BR-CONF-05)', async () => {
    await db.query(`INSERT INTO availability_slots (tutor_id, time_range) VALUES ($1, ${FUTURE})`, [LAURA]);
    await expect(rejectedWith(db.query(
      `INSERT INTO availability_slots (tutor_id, time_range)
       VALUES ($1, tstzrange('2031-01-01 10:30+00', '2031-01-01 11:30+00'))`,
      [LAURA],
    ))).resolves.toBe('no_tutor_slot_overlap');
  });

  it('rejects two active appointments on one slot, and one student in two places (BR-CONF-05)', async () => {
    const insertSlot = (tutor) => db.query(
      `INSERT INTO availability_slots (tutor_id, time_range) VALUES ($1, ${FUTURE}) RETURNING id`,
      [tutor],
    );
    const insertAppointment = (slot, tutor, student) => db.query(
      `INSERT INTO appointments (slot_id, tutor_id, student_id, time_range) VALUES ($1, $2, $3, ${FUTURE})`,
      [slot, tutor, student],
    );
    const lauraSlot = (await insertSlot(LAURA)).rows[0].id;
    const carlosSlot = (await insertSlot(CARLOS)).rows[0].id;
    await insertAppointment(lauraSlot, LAURA, DIEGO);

    await expect(rejectedWith(insertAppointment(lauraSlot, LAURA, ADMIN)))
      .resolves.toBe('uq_appointments_active_slot');
    await expect(rejectedWith(insertAppointment(carlosSlot, CARLOS, DIEGO)))
      .resolves.toBe('no_student_appointment_overlap');
  });

  it('rejects an appointment whose copied data differs from its slot', async () => {
    await expect(rejectedWith(db.query(
      `INSERT INTO appointments (slot_id, tutor_id, student_id, time_range) VALUES ($1, $2, $3, ${FUTURE})`,
      [FREE_CARLOS_SLOT, LAURA, DIEGO],
    ))).resolves.toMatch(/_fkey$/);
  });

  it('rejects a rating outside 1 to 5 (CU-12)', async () => {
    await expect(rejectedWith(db.query(
      "UPDATE appointments SET student_rating = 6 WHERE id = 'f0000000-0000-0000-0000-000000000002'",
    ))).resolves.toBe('appointments_student_rating_check');
  });

  it('keeps audit_logs append-only (CU-14)', async () => {
    await db.query("INSERT INTO audit_logs (action, target_type) VALUES ('TEST', 'USER')");
    await expect(db.query("UPDATE audit_logs SET action = 'X'")).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM audit_logs')).rejects.toThrow(/append-only/);
  });
});

describe('CU-06 search', () => {
  it.each([
    ['ignores accents in names', 'search=garcia', ['García']],
    ['ignores accents in subjects', 'search=algebra', ['Martín']],
    ['treats % as a literal', 'search=%25', []],
    ['filters by subject', `subjectId=${SOFT301}`, ['García']],
  ])('%s', async (_name, query, lastNames) => {
    const res = await request(app).get(`/api/tutors?${query}`);
    expect(res.status).toBe(200);
    expect(res.body.map((tutor) => tutor.last_name)).toEqual(lastNames);
  });

  it('keeps every subject of a tutor when filtering, and no private data', async () => {
    const { body } = await request(app).get(`/api/tutors?subjectId=${SOFT301}`);
    expect(body[0].subjects).toHaveLength(2);
    expect(body[0]).not.toHaveProperty('meeting_url');
    expect(body[0]).not.toHaveProperty('email');
  });

  it.each(['search=a&search=b', 'search=%00', 'offset=99999999999999999999'])('answers 400, not 500, for ?%s', async (query) => {
    expect((await request(app).get(`/api/tutors?${query}`)).status).toBe(400);
  });
});

describe('CU-03 profile', () => {
  const profile = { bio: 'New bio', meetingUrl: 'https://zoom.us/j/1', subjectIds: [SOFT301] };

  it('updates the profile and replaces the subjects', async () => {
    const cookie = await signIn('laura.garcia@unimentor.edu');
    expect((await put('/api/tutors/profile').set('Cookie', cookie).send(profile)).status).toBe(200);

    const { body } = await request(app).get('/api/tutors/profile').set('Cookie', cookie);
    expect(body).toMatchObject({ bio: 'New bio', meeting_url: 'https://zoom.us/j/1' });
    expect(body.subjects.map((subject) => subject.id)).toEqual([SOFT301]);
  });

  it('keeps the bio when the request omits it and clears it with an empty text', async () => {
    const cookie = await signIn('laura.garcia@unimentor.edu');
    await put('/api/tutors/profile').set('Cookie', cookie).send(profile);

    await put('/api/tutors/profile').set('Cookie', cookie).send({ meetingUrl: profile.meetingUrl, subjectIds: profile.subjectIds });
    expect((await request(app).get('/api/tutors/profile').set('Cookie', cookie)).body.bio).toBe('New bio');

    await put('/api/tutors/profile').set('Cookie', cookie).send({ ...profile, bio: '' });
    expect((await request(app).get('/api/tutors/profile').set('Cookie', cookie)).body.bio).toBe('');
  });

  it('answers 400, not 500, for a link longer than the column', async () => {
    const cookie = await signIn('laura.garcia@unimentor.edu');
    const res = await put('/api/tutors/profile').set('Cookie', cookie)
      .send({ ...profile, meetingUrl: `https://zoom.us/j/${'1'.repeat(600)}` });
    expect(res.status).toBe(400);
  });
});

describe('CU-01 and CU-02', () => {
  const newUser = { firstName: 'Ana', lastName: 'Ruiz', email: 'Ana.Ruiz@MyUax.com', password: 'abcd1234', role: 'STUDENT' };

  it('registers a user once, even with simultaneous requests', async () => {
    const results = await Promise.all([1, 2, 3].map(() => post('/api/auth/register').send(newUser)));
    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);

    await signIn('ana.ruiz@myuax.com', 'abcd1234');
  });

  it('answers 400, not 500, for a NUL byte', async () => {
    expect((await post('/api/auth/register').send({ ...newUser, firstName: 'a\u0000' })).status).toBe(400);
    expect((await post('/api/auth/login').send({ email: 'a\u0000@myuax.com', password: 'x' })).status).toBe(400);
  });

  it('locks the account after 5 failures, even simultaneous ones, and unlocks it later', async () => {
    const email = 'carlos.martin@unimentor.edu';
    const failures = await Promise.all(Array.from({ length: 5 }, () => post('/api/auth/login').send({ email, password: 'wrong' })));
    expect(failures.every((res) => res.status === 401)).toBe(true);

    expect((await post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(429);

    await db.query("UPDATE users SET locked_until = now() - interval '1 second' WHERE email = $1", [email]);
    await signIn(email);
  });
});

describe('CU-13 and CU-14', () => {
  it('suspends a tutor: cancels sessions, blocks slots, revokes the session and audits it', async () => {
    const admin = await signIn('admin@unimentor.edu');
    const tutor = await signIn('laura.garcia@unimentor.edu');

    const res = await post(`/api/admin/users/${LAURA}/suspend`).set('Cookie', admin).send({ reason: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.cancelledAppointments).toBe(1);

    const { rows } = await db.query(
      'SELECT status FROM availability_slots WHERE tutor_id = $1 AND lower(time_range) > now()',
      [LAURA],
    );
    expect(rows.every((slot) => slot.status === 'UNAVAILABLE')).toBe(true);

    expect((await request(app).get('/api/auth/me').set('Cookie', tutor)).status).toBe(403);
    expect((await post('/api/auth/login').send({ email: 'laura.garcia@unimentor.edu', password: PASSWORD })).status).toBe(403);
    expect((await request(app).get('/api/tutors')).body.map((item) => item.id)).not.toContain(LAURA);

    const audit = await request(app).get('/api/admin/audit-logs?action=USER_SUSPENDED').set('Cookie', admin);
    expect(audit.body[0].details.reason).toBe('test');
  });

  it("frees the slot of a suspended student's session", async () => {
    await db.query("UPDATE availability_slots SET status = 'BOOKED' WHERE id = $1", [FREE_CARLOS_SLOT]);
    await db.query(
      'INSERT INTO appointments (slot_id, tutor_id, student_id, time_range) SELECT id, tutor_id, $2, time_range FROM availability_slots WHERE id = $1',
      [FREE_CARLOS_SLOT, DIEGO],
    );
    const admin = await signIn('admin@unimentor.edu');

    expect((await post(`/api/admin/users/${DIEGO}/suspend`).set('Cookie', admin).send({ reason: 'test' })).status).toBe(200);

    const { rows } = await db.query('SELECT status FROM availability_slots WHERE id = $1', [FREE_CARLOS_SLOT]);
    expect(rows[0].status).toBe('AVAILABLE');
  });

  it('computes the metrics from the real tables', async () => {
    const admin = await signIn('admin@unimentor.edu');
    const { body } = await request(app).get('/api/admin/metrics').set('Cookie', admin);
    expect(body).toMatchObject({ total_bookings: 3, confirmed_sessions: 1, completed_sessions: 1, cancelled_sessions: 1, cancellation_rate: 0.333 });
  });
});

describe('npm run db:create-admin', () => {
  const env = { ADMIN_EMAIL: 'Real.Admin@myuax.com', ADMIN_PASSWORD: 'long-enough-pass-1' };

  it('creates an administrator who can sign in, and records it', async () => {
    runScript('createAdmin', env);

    const cookie = await signIn('real.admin@myuax.com', env.ADMIN_PASSWORD);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.role).toBe('ADMIN');
    const { rows } = await db.query("SELECT 1 FROM audit_logs WHERE action = 'ADMIN_CREATED'");
    expect(rows).toHaveLength(1);
  });

  it('refuses a weak password', () => {
    expect(() => runScript('createAdmin', { ...env, ADMIN_PASSWORD: 'short1' })).toThrow(/ADMIN_PASSWORD needs/);
  });
});

describe('npm run db:seed', () => {
  it('refuses to erase a production database', async () => {
    expect(() => runScript('seed', { NODE_ENV: 'production', JWT_SECRET: 'x', FRONTEND_ORIGIN: 'https://x.example' }))
      .toThrow(/Refusing to seed/);
  });
});
