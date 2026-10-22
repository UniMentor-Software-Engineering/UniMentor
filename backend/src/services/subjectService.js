// Business Logic layer for the subject catalog.
const subjectRepository = require('../repositories/subjectRepository');

async function listSubjects() {
  return subjectRepository.findAll();
}

module.exports = { listSubjects };
