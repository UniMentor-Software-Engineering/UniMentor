const subjectService = require('../services/subjectService');

async function getSubjects(req, res, next) {
  try {
    const subjects = await subjectService.getAllSubjects();
    return res.status(200).json({ data: subjects });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSubjects
};