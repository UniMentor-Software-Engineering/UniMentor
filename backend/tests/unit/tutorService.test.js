const tutorService = require('../../src/services/tutorService');
const tutorRepository = require('../../src/repositories/tutorRepository');
const AppError = require('../../src/utils/AppError');

jest.mock('../../src/repositories/tutorRepository');

describe('tutorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateMeetingUrl', () => {
    it('should validate valid Google Meet, Zoom, and Teams URLs', () => {
      expect(tutorService.validateMeetingUrl('https://meet.google.com/abc-defg-hij')).toBe(true);
      expect(tutorService.validateMeetingUrl('https://zoom.us/j/123456')).toBe(true);
      expect(tutorService.validateMeetingUrl('https://sub.zoom.us/j/123456')).toBe(true);
      expect(tutorService.validateMeetingUrl('https://teams.microsoft.com/l/meetup-join/123')).toBe(true);
    });

    it('should reject non-https or unapproved domains', () => {
      expect(tutorService.validateMeetingUrl('http://meet.google.com/abc')).toBe(false);
      expect(tutorService.validateMeetingUrl('javascript:alert(1)//meet.google.com')).toBe(false);
      expect(tutorService.validateMeetingUrl('https://malicious-site.com')).toBe(false);
    });
  });

  describe('searchTutors', () => {
    it('should pass the filters to the repository and return its rows', async () => {
      const rows = [{ id: 'b0000000-0000-0000-0000-000000000001', first_name: 'Laura' }];
      tutorRepository.findTutors.mockResolvedValue(rows);

      const filters = { subjectId: 'd0000000-0000-0000-0000-000000000001', limit: 10, offset: 0 };
      await expect(tutorService.searchTutors(filters)).resolves.toEqual(rows);
      expect(tutorRepository.findTutors).toHaveBeenCalledWith(filters);
    });
  });

  describe('getTutorProfile', () => {
    it('should return the tutor when it exists', async () => {
      const tutor = { id: 'b0000000-0000-0000-0000-000000000001', first_name: 'Laura' };
      tutorRepository.findTutorById.mockResolvedValue(tutor);

      await expect(tutorService.getTutorProfile(tutor.id)).resolves.toEqual(tutor);
    });

    it('should throw 404 when the tutor does not exist or is not active', async () => {
      tutorRepository.findTutorById.mockResolvedValue(null);

      await expect(tutorService.getTutorProfile('b0000000-0000-0000-0000-000000000009'))
        .rejects.toThrow(new AppError(404, 'Tutor not found'));
    });
  });

  describe('updateProfile', () => {
    it('should throw 400 when the bio is longer than 1000 characters', async () => {
      await expect(
        tutorService.updateProfile('user-uuid', {
          bio: 'a'.repeat(1001),
          meetingUrl: 'https://zoom.us/j/1',
          subjectIds: ['sub-uuid-1']
        })
      ).rejects.toThrow(new AppError(400, 'Bio must not exceed 1000 characters'));
    });

    it('should throw 400 when subjects array is empty', async () => {
      await expect(
        tutorService.updateProfile('user-uuid', { bio: 'Hi', meetingUrl: 'https://zoom.us/j/1', subjectIds: [] })
      ).rejects.toThrow(new AppError(400,'At least one subject is required'));
    });

    it('should throw 400 when meeting url is invalid', async () => {
      await expect(
        tutorService.updateProfile('user-uuid', {
          bio: 'Hi',
          meetingUrl: 'https://evil.com',
          subjectIds: ['sub-uuid-1']
        })
      ).rejects.toThrow(new AppError(400,'A valid HTTPS meeting URL (Google Meet, Zoom, or Teams) is required'));
    });

    it('should throw 400 if any subject does not exist', async () => {
      tutorRepository.checkSubjectsExist.mockResolvedValue(false);

      await expect(
        tutorService.updateProfile('user-uuid', {
          bio: 'Hi',
          meetingUrl: 'https://zoom.us/j/123',
          subjectIds: ['sub-uuid-1']
        })
      ).rejects.toThrow(new AppError(400,'One or more selected subjects do not exist'));
    });

    it('should update profile when payload is correct', async () => {
      tutorRepository.checkSubjectsExist.mockResolvedValue(true);
      tutorRepository.updateProfileAndSubjects.mockResolvedValue();

      const res = await tutorService.updateProfile('user-uuid', {
        bio: 'Valid bio',
        meetingUrl: 'https://zoom.us/j/123',
        subjectIds: ['sub-uuid-1']
      });

      expect(res.message).toBe('Tutor profile updated successfully');
      expect(tutorRepository.updateProfileAndSubjects).toHaveBeenCalled();
    });
  });
});