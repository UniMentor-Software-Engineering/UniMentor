// Unit tests for the SQL built by the repositories. The db module is mocked, so we check
// the parameters and the shape of the queries, not the database itself.
jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));

const db = require('../../src/config/db');
const tutorRepository = require('../../src/repositories/tutorRepository');
const subjectRepository = require('../../src/repositories/subjectRepository');

const SUBJECT_ID = 'd0000000-0000-0000-0000-000000000001';
const USER_ID = 'b0000000-0000-0000-0000-000000000001';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('findTutors', () => {
  it('uses only limit and offset as parameters when there are no filters', async () => {
    db.query.mockResolvedValue({ rows: [{ id: USER_ID }] });

    const rows = await tutorRepository.findTutors({ limit: 10, offset: 0 });

    expect(rows).toEqual([{ id: USER_ID }]);
    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual([10, 0]);
    expect(sql).toContain('LIMIT $1 OFFSET $2');
    expect(sql).not.toContain('ILIKE');
  });

  it('adds the subject filter as a parameter', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await tutorRepository.findTutors({ subjectId: SUBJECT_ID, limit: 5, offset: 10 });

    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual([SUBJECT_ID, 5, 10]);
    expect(sql).toContain('ts_filter.subject_id = $1');
    expect(sql).toContain('LIMIT $2 OFFSET $3');
  });

  it('adds an accent-insensitive text search with ILIKE and a single parameter', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await tutorRepository.findTutors({ search: 'laura', limit: 10, offset: 0 });

    const [sql, params] = db.query.mock.calls[0];
    expect(params).toEqual(['%laura%', 10, 0]);
    expect(sql).toContain('unaccent(u.first_name) ILIKE unaccent($1)');
    expect(sql).toContain('unaccent(s_search.name) ILIKE unaccent($1)');
    expect(sql).not.toContain('laura');
  });

  it('escapes LIKE wildcards in the search term', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await tutorRepository.findTutors({ search: '100%_a\\b', limit: 10, offset: 0 });

    expect(db.query.mock.calls[0][1][0]).toBe('%100\\%\\_a\\\\b%');
  });

  it('combines subject and search parameters in order', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await tutorRepository.findTutors({ subjectId: SUBJECT_ID, search: 'x', limit: 10, offset: 0 });

    expect(db.query.mock.calls[0][1]).toEqual([SUBJECT_ID, '%x%', 10, 0]);
  });

  it('never selects the meeting URL', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await tutorRepository.findTutors({ limit: 10, offset: 0 });

    expect(db.query.mock.calls[0][0]).not.toContain('meeting_url');
  });
});

describe('findTutorById', () => {
  it('returns the first row', async () => {
    db.query.mockResolvedValue({ rows: [{ id: USER_ID }] });

    await expect(tutorRepository.findTutorById(USER_ID)).resolves.toEqual({ id: USER_ID });
    expect(db.query.mock.calls[0][1]).toEqual([USER_ID]);
  });

  it('returns null when there is no row', async () => {
    db.query.mockResolvedValue({ rows: [] });

    await expect(tutorRepository.findTutorById(USER_ID)).resolves.toBeNull();
  });
});

describe('updateProfileAndSubjects', () => {
  it('upserts the profile and replaces the subjects inside one transaction', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    db.withTransaction.mockImplementation(async (work) => work(client));

    await tutorRepository.updateProfileAndSubjects(USER_ID, {
      bio: 'bio',
      meetingUrl: 'https://zoom.us/j/1',
      subjectIds: [SUBJECT_ID],
    });

    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[0][0]).toContain('ON CONFLICT (user_id) DO UPDATE');
    expect(client.query.mock.calls[0][1]).toEqual([USER_ID, 'bio', 'https://zoom.us/j/1']);
    expect(client.query.mock.calls[1][0]).toContain('DELETE FROM tutor_subjects');
    expect(client.query.mock.calls[2][1]).toEqual([USER_ID, [SUBJECT_ID]]);
  });
});

describe('checkSubjectsExist', () => {
  it('is true when every ID is found', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'a' }, { id: 'b' }] });

    await expect(tutorRepository.checkSubjectsExist(['a', 'b'])).resolves.toBe(true);
  });

  it('is false when some ID is missing', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'a' }] });

    await expect(tutorRepository.checkSubjectsExist(['a', 'b'])).resolves.toBe(false);
  });
});

describe('subjectRepository.findAll', () => {
  it('returns the subject catalog', async () => {
    db.query.mockResolvedValue({ rows: [{ id: SUBJECT_ID, code: 'COMP101' }] });

    await expect(subjectRepository.findAll()).resolves.toEqual([{ id: SUBJECT_ID, code: 'COMP101' }]);
  });
});

describe('findOwnProfile', () => {
  it('returns the profile with the meeting link, or null', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: SUBJECT_ID, meeting_url: 'https://zoom.us/j/1' }] });
    await expect(tutorRepository.findOwnProfile(SUBJECT_ID)).resolves.toMatchObject({ meeting_url: 'https://zoom.us/j/1' });
    expect(db.query.mock.calls.at(-1)[0]).toContain('tp.meeting_url');
    expect(db.query.mock.calls.at(-1)[1]).toEqual([SUBJECT_ID]);

    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(tutorRepository.findOwnProfile(SUBJECT_ID)).resolves.toBeNull();
  });
});
