const tutorService = require('../services/tutorService');

class TutorController {
  async search(req, res, next) {
    try {
      const tutors = await tutorService.searchTutors(req.query);
      res.status(200).json({ success: true, data: tutors });
    } catch (error) { next(error); }
  }
  async getMyProfile(req, res, next) {
    try {
      const userId = req.user?.id || req.query.userId;
      const profile = await tutorService.getProfile(userId);
      res.status(200).json({ success: true, data: profile });
    } catch (error) { next(error); }
  }
  async updateMyProfile(req, res, next) {
    try {
      const userId = req.user?.id || req.body.userId;
      const updated = await tutorService.updateProfile(userId, req.body);
      res.status(200).json({ success: true, data: updated });
    } catch (error) { next(error); }
  }
}
module.exports = new TutorController();