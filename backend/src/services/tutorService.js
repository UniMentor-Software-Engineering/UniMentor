const tutorRepository = require('../repositories/tutorRepository');
const AppError = require('../utils/AppError');
const { isUuid } = require('../utils/validators');

const ALLOWED_MEETING_HOSTS = [
  'meet.google.com',
  'zoom.us',
  'teams.microsoft.com',
  'teams.live.com'
];

function validateMeetingUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return ALLOWED_MEETING_HOSTS.some(allowed =>
      hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

async function searchTutors(filters) {
  return await tutorRepository.findTutors(filters);
}

async function getTutorProfile(tutorId) {
  const tutor = await tutorRepository.findTutorById(tutorId);
  if (!tutor) {
    throw new AppError(404, 'Tutor not found');
  }
  return tutor;
}

// CU-03, step 2: the tutor's own profile, with the meeting link.
async function getOwnProfile(userId) {
  const profile = await tutorRepository.findOwnProfile(userId);
  if (!profile) {
    throw new AppError(404, 'Tutor not found');
  }
  return profile;
}

async function updateProfile(userId, { bio, meetingUrl, subjectIds } = {}) {
  if (!subjectIds || !Array.isArray(subjectIds) || subjectIds.length === 0) {
    throw new AppError(400, 'At least one subject is required', 'SUBJECTS_REQUIRED');
  }
  // Non-UUID values would make the ::uuid[] cast fail with a 500, and repeated IDs
  // would break the primary key of tutor_subjects.
  if (!subjectIds.every(isUuid)) {
    throw new AppError(400, 'One or more selected subjects do not exist', 'SUBJECTS_REQUIRED');
  }
  const uniqueSubjectIds = [...new Set(subjectIds)];

  if (bio !== undefined && bio !== null && (typeof bio !== 'string' || bio.length > 1000)) {
    throw new AppError(400, 'Bio must not exceed 1000 characters', 'INVALID_BIO');
  }

  if (typeof meetingUrl !== 'string' || !validateMeetingUrl(meetingUrl)) {
    throw new AppError(400, 'A valid HTTPS meeting URL (Google Meet, Zoom, or Teams) is required', 'INVALID_MEETING_URL');
  }

  const allExist = await tutorRepository.checkSubjectsExist(uniqueSubjectIds);
  if (!allExist) {
    throw new AppError(400, 'One or more selected subjects do not exist', 'SUBJECTS_REQUIRED');
  }

  await tutorRepository.updateProfileAndSubjects(userId, { bio, meetingUrl, subjectIds: uniqueSubjectIds });
  return { message: 'Tutor profile updated successfully' };
}

module.exports = {
  searchTutors,
  getTutorProfile,
  getOwnProfile,
  updateProfile,
  validateMeetingUrl
};