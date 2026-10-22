// Error with an HTTP status code. Services throw it when a business rule fails
// (e.g. new AppError(409, 'This time slot has just been reserved by another student.'))
// and the error middleware turns it into a JSON response.
class AppError extends Error {
  /**
   * @param {number} status HTTP status code (400, 401, 403, 404, 409, 429...)
   * @param {string} message Message safe to show to the user
   * @param {string} [code] Optional machine-readable code for the frontend
   */
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.statusCode = status;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;