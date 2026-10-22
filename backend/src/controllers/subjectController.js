const subjectService = require('../services/subjectService');

async function getAllSubjects(req, res, next) {
  try {
    const subjects = await subjectService.listSubjects();
    res.status(200).json(subjects);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllSubjects,
};