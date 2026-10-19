// Unit tests for the transaction helper used by the repositories (CU-08, CU-13).
// The pg library is mocked: no real database is needed.
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
  on: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

const db = require('../src/config/db');

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.connect.mockResolvedValue(mockClient);
  mockClient.query.mockResolvedValue({ rows: [] });
});

describe('query', () => {
  it('delegates parameterized queries to the pool', async () => {
    await db.query('SELECT * FROM users WHERE id = $1', ['abc']);

    expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['abc']);
  });
});

describe('withTransaction', () => {
  it('commits and returns the result when the work succeeds', async () => {
    const result = await db.withTransaction(async (client) => {
      await client.query('SELECT 1');
      return 'done';
    });

    expect(result).toBe('done');
    expect(mockClient.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back, releases the client and rethrows when the work fails', async () => {
    const failure = new Error('slot already booked');

    await expect(
      db.withTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(mockClient.query.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
