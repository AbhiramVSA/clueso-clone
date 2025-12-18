/**
 * Middlewares Index
 * Export all middleware modules.
 */

module.exports = {
    rateLimiter: require('./rate-limiter'),
    validator: require('./validator'),
    errorHandler: require('./error-handler')
};
