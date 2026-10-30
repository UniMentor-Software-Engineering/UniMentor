const request = require('supertest');

// Only the database is mocked, so the request goes through the real route, controller,
// service and repository of the subjects module.
jest.mock('../../src/config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

const db = require('../../src/config/db');
const app = require('../../src/app');

describe('GET /api/subjects', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with the subject catalog ordered by name', async () => {
    const subjects = [
      { id: 'd0000000-0000-0000-0000-000000000002', code: 'MATH201', name: 'Álgebra Lineal y Geometría', department: 'Matemáticas' },
      { id: 'd0000000-0000-0000-0000-000000000003', code: 'SOFT301', name: 'Ingeniería del Software', department: 'Ingeniería Informática' },
    ];
    db.query.mockResolvedValue({ rows: subjects });

    const res = await request(app).get('/api/subjects');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(subjects);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ORDER BY name'));
  });

  it('returns 500 with the standard error format when the database fails', async () => {
    db.query.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/subjects');

    expect(res.status).toBe(500);
    expect(res.body.error.status).toBe(500);
  });
});
