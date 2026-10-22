const tutorRepository = require('../repositories/tutorRepository');
const AppError = require('../utils/AppError');

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

async function updateProfile(userId, { bio, meetingUrl, subjectIds }) {
  if (!subjectIds || !Array.isArray(subjectIds) || subjectIds.length === 0) {
    throw new AppError(400, 'At least one subject is required');
  }

  if (bio && bio.length > 1000) {
    throw new AppError(400, 'Bio must not exceed 1000 characters');
  }

  if (!meetingUrl || !validateMeetingUrl(meetingUrl)) {
    throw new AppError(400, 'A valid HTTPS meeting URL (Google Meet, Zoom, or Teams) is required');
  }

  const allExist = await tutorRepository.checkSubjectsExist(subjectIds);
  if (!allExist) {
    throw new AppError(400, 'One or more selected subjects do not exist');
  }

  await tutorRepository.updateProfileAndSubjects(userId, { bio, meetingUrl, subjectIds });
  return { message: 'Tutor profile updated successfully' };
}

module.exports = {
  searchTutors,
  getTutorProfile,
  updateProfile,
  validateMeetingUrl
};