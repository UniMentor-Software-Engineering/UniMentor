const tutorService = require('../services/tutorService');
const AppError = require('../utils/AppError');
const { isUuid, parsePagination } = require('../utils/validators');

const DEFAULT_LIMIT = 10;
const MAX_SEARCH_LENGTH = 100;

async function search(req, res, next) {
  try {
    const { subjectId, search: searchTerm } = req.query;
    const { limit, offset } = parsePagination(req.query, DEFAULT_LIMIT);

    if (subjectId && !isUuid(subjectId)) {
      throw new AppError(400, 'Invalid subjectId format');
    }

    // A repeated ?search=a&search=b arrives as an array.
    if (searchTerm !== undefined && (typeof searchTerm !== 'string' || searchTerm.length > MAX_SEARCH_LENGTH)) {
      throw new AppError(400, `Search must be a text of at most ${MAX_SEARCH_LENGTH} characters`);
    }

    const tutors = await tutorService.searchTutors({
      subjectId,
      search: searchTerm,
      limit,
      offset
    });

    res.status(200).json(tutors);
  } catch (error) {
    next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      throw new AppError(400, 'Invalid tutor ID');
    }
    const tutor = await tutorService.getTutorProfile(id);
    res.status(200).json(tutor);
  } catch (error) {
    next(error);
  }
}

async function getOwnProfile(req, res, next) {
  try {
    const profile = await tutorService.getOwnProfile(req.user.id);
    res.status(200).json(profile);
  } catch (error) {
    next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      throw new AppError(401, 'Unauthorized');
    }

    const result = await tutorService.updateProfile(req.user.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  search,
  getProfile,
  getOwnProfile,
  updateProfile
};