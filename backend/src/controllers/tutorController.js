const tutorService = require('../services/tutorService');
const AppError = require('../utils/AppError');
const { isUuid } = require('../utils/validators');

async function search(req, res, next) {
  try {
    const { subjectId, search: searchTerm, limit = 10, offset = 0 } = req.query;

    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);

    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new AppError(400, 'Limit must be an integer between 1 and 50');
    }

    if (isNaN(parsedOffset) || parsedOffset < 0) {
      throw new AppError(400, 'Offset must be a non-negative integer');
    }

    if (subjectId && !isUuid(subjectId)) {
      throw new AppError(400, 'Invalid subjectId format');
    }

    const tutors = await tutorService.searchTutors({
      subjectId,
      search: searchTerm,
      limit: parsedLimit,
      offset: parsedOffset
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