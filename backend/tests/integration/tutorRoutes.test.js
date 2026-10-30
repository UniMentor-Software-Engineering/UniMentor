const request = require('supertest');
const app = require('../../src/app');
const jwt = require('jsonwebtoken');
const config = require('../../src/config/env');
const tutorService = require('../../src/services/tutorService');
const userRepository = require('../../src/repositories/userRepository');

jest.mock('../../src/services/tutorService');
jest.mock('../../src/repositories/userRepository');

const TUTOR_ID = 'b0000000-0000-0000-0000-000000000001';

// A signed session cookie; verifyJWT reads the role from the (mocked) database.
function cookieFor(role) {
  userRepository.findAuthState.mockResolvedValue({ id: TUTOR_ID, role, status: 'ACTIVE' });
  return `token=${jwt.sign({ sub: TUTOR_ID, role }, config.jwtSecret, { expiresIn: '1h' })}`;
}

describe('Tutor Routes Integration Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/tutors', () => {
    it('should return 200 with filtered list when valid query params are provided', async () => {
      const mockTutors = [
        {
          id: 'b0000000-0000-0000-0000-000000000001',
          first_name: 'Jane',
          last_name: 'Doe',
          bio: 'Math tutor',
          subjects: ['Mathematics']
        }
      ];

      tutorService.searchTutors.mockResolvedValue(mockTutors);

      const validSubjectId = 'd0000000-0000-0000-0000-000000000001';
      const res = await request(app)
        .get(`/api/tutors?subjectId=${validSubjectId}&search=Math&limit=5&offset=0`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockTutors);
      expect(tutorService.searchTutors).toHaveBeenCalledWith({
        subjectId: validSubjectId,
        search: 'Math',
        limit: 5,
        offset: 0
      });
    });

    it('should return 400 on invalid limit', async () => {
      const res = await request(app).get('/api/tutors?limit=invalid');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Limit must be an integer');
    });

    it('should return 400 on invalid offset', async () => {
      const res = await request(app).get('/api/tutors?offset=-1');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Offset must be a non-negative integer');
    });

    it('should return 400 on invalid subjectId format', async () => {
      const res = await request(app).get('/api/tutors?subjectId=invalid-uuid-1234');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid subjectId format');
    });
  });

  describe('GET /api/tutors/:id', () => {
    it('should return 200 and tutor details for a valid UUID', async () => {
      const mockTutor = {
        id: 'b0000000-0000-0000-0000-000000000001',
        first_name: 'John',
        last_name: 'Smith',
        bio: 'Expert tutor'
      };

      tutorService.getTutorProfile.mockResolvedValue(mockTutor);

      const res = await request(app).get(`/api/tutors/${mockTutor.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockTutor);
      expect(tutorService.getTutorProfile).toHaveBeenCalledWith(mockTutor.id);
    });

    it('should return 400 when tutor ID has invalid format', async () => {
      const res = await request(app).get('/api/tutors/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Invalid tutor ID');
    });
  });

  describe('PUT /api/tutors/profile', () => {
    it('should return 401 when request is unauthenticated', async () => {
      const res = await request(app)
        .put('/api/tutors/profile')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
        bio: 'Updated bio',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        subjectIds: ['d0000000-0000-0000-0000-000000000001']
      });

      expect(res.status).toBe(401);
    });

    it('should return 403 when the signed-in user is not a tutor', async () => {
      const res = await request(app)
        .put('/api/tutors/profile')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', cookieFor('STUDENT'))
        .send({ bio: 'Hi' });

      expect(res.status).toBe(403);
      expect(tutorService.updateProfile).not.toHaveBeenCalled();
    });

    it('should update the profile of the signed-in tutor', async () => {
      tutorService.updateProfile.mockResolvedValue({ message: 'Tutor profile updated successfully' });
      const body = {
        bio: 'Updated bio',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        subjectIds: ['d0000000-0000-0000-0000-000000000001']
      };

      const res = await request(app)
        .put('/api/tutors/profile')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', cookieFor('TUTOR'))
        .send(body);

      expect(res.status).toBe(200);
      expect(tutorService.updateProfile).toHaveBeenCalledWith(TUTOR_ID, body);
    });
  });

  describe('GET /api/tutors/profile (CU-03, step 2)', () => {
    it('should return 401 without a session instead of treating "profile" as an ID', async () => {
      const res = await request(app).get('/api/tutors/profile');

      expect(res.status).toBe(401);
      expect(tutorService.getTutorProfile).not.toHaveBeenCalled();
    });

    it('should return 403 to a student', async () => {
      const res = await request(app).get('/api/tutors/profile').set('Cookie', cookieFor('STUDENT'));
      expect(res.status).toBe(403);
    });

    it('should return the signed-in tutor\'s own profile', async () => {
      const profile = { id: TUTOR_ID, bio: 'Hi', meeting_url: 'https://zoom.us/j/1', subjects: [] };
      tutorService.getOwnProfile.mockResolvedValue(profile);

      const res = await request(app).get('/api/tutors/profile').set('Cookie', cookieFor('TUTOR'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual(profile);
      expect(tutorService.getOwnProfile).toHaveBeenCalledWith(TUTOR_ID);
    });
  });
});