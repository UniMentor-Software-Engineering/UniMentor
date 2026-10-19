// Integration tests for the app skeleton: routing, layers, CORS and error handling.
// The database module is mocked, so these tests do not need a running PostgreSQL.
const request = require('supertest');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

const db = require('../src/config/db');
const app = require('../src/app');

describe('GET /api/health', () => {
  it('returns 200 with the service status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });
});

describe('GET /api/health/db', () => {
  it('returns 200 when PostgreSQL answers', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ now: '2026-10-19T10:00:00.000Z' }] });

    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('returns 503 with the standard error format when PostgreSQL is down', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { status: 503, message: 'Database unavailable' },
    });
  });
});

describe('Error middleware', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.error.status).toBe(400);
  });
});

describe('CORS with credentials (ADR 4)', () => {
  it('allows credentials for a configured frontend origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5500');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5500');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow an unknown origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
