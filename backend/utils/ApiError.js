// Operational error carrying an HTTP status code. Thrown from controllers/models
// and translated to a JSON response by the central error handler in server.js.
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }

  static badRequest(message = 'Bad request') { return new ApiError(400, message); }
  static unauthorized(message = 'Unauthorized') { return new ApiError(401, message); }
  static forbidden(message = 'Forbidden') { return new ApiError(403, message); }
  static notFound(message = 'Not found') { return new ApiError(404, message); }
  static conflict(message = 'Conflict') { return new ApiError(409, message); }
}

module.exports = ApiError;
