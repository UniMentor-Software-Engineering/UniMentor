const tutorRepository = require('../repositories/tutorRepository');

// Asumimos que P1 creó una clase de error en utils/AppError.js
class AppError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

class TutorService {
  async searchTutors(filters) { return await tutorRepository.findTutors(filters); }
  async getProfile(userId) {
    const profile = await tutorRepository.findProfileByUserId(userId);
    if (!profile) throw new AppError(404, 'Perfil no encontrado');
    return profile;
  }
  async updateProfile(userId, data) {
    if (data.meetingUrl && !data.meetingUrl.includes('meet.google.com')) throw new AppError(400, 'URL inválida');
    await tutorRepository.updateProfileAndSubjects(userId, data);
    return await tutorRepository.findProfileByUserId(userId);
  }
}
module.exports = new TutorService();