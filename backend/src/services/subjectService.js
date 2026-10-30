const subjectRepository = require('../repositories/subjectRepository');

async function listSubjects() {
  return await subjectRepository.findAll();
}

module.exports = {
  listSubjects,
};