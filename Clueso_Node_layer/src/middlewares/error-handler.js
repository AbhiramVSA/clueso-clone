/**
 * Error Handling Middleware
 * Centralized error handling with standardized responses.
 * 
 * Features:
 * - Consistent error response format
 * - Correlation IDs for tracking
 * - Different responses for dev vs production
 * - Error logging with context
 */

const { Logger } = require('../config');

// Error codes for categorization
const ErrorCodes = {
    // Client errors (4xx)
    BAD_REQUEST: 'BAD_REQUEST',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
    CONFLICT: 'CONFLICT',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',

    // Server errors (5xx)
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    DATABASE_ERROR: 'DATABASE_ERROR',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
    TIMEOUT: 'TIMEOUT'
};

// Map status codes to error codes
const statusToCode = {
    400: ErrorCodes.BAD_REQUEST,
    401: ErrorCodes.UNAUTHORIZED,
    403: ErrorCodes.FORBIDDEN,
    404: ErrorCodes.NOT_FOUND,
    405: ErrorCodes.METHOD_NOT_ALLOWED,
    409: ErrorCodes.CONFLICT,
    413: ErrorCodes.PAYLOAD_TOO_LARGE,
    415: ErrorCodes.UNSUPPORTED_MEDIA_TYPE,
    429: ErrorCodes.RATE_LIMIT_EXCEEDED,
    500: ErrorCodes.INTERNAL_ERROR,
    501: ErrorCodes.NOT_IMPLEMENTED,
    503: ErrorCodes.SERVICE_UNAVAILABLE
};

/**
 * Generate a correlation ID for request tracking
 */
function generateCorrelationId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}

/**
 * Custom application error class
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = null, details = null) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code || statusToCode[statusCode] || ErrorCodes.INTERNAL_ERROR;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Create specific error types
 */
const createError = {
    badRequest: (message, details) => new AppError(message, 400, ErrorCodes.BAD_REQUEST, details),
    validation: (message, details) => new AppError(message, 400, ErrorCodes.VALIDATION_ERROR, details),
    unauthorized: (message) => new AppError(message || 'Unauthorized', 401, ErrorCodes.UNAUTHORIZED),
    forbidden: (message) => new AppError(message || 'Forbidden', 403, ErrorCodes.FORBIDDEN),
    notFound: (message) => new AppError(message || 'Resource not found', 404, ErrorCodes.NOT_FOUND),
    conflict: (message, details) => new AppError(message, 409, ErrorCodes.CONFLICT, details),
    rateLimit: (message, retryAfter) => {
        const error = new AppError(message || 'Rate limit exceeded', 429, ErrorCodes.RATE_LIMIT_EXCEEDED);
        error.retryAfter = retryAfter;
        return error;
    },
    internal: (message) => new AppError(message || 'Internal server error', 500, ErrorCodes.INTERNAL_ERROR),
    serviceUnavailable: (message) => new AppError(message || 'Service unavailable', 503, ErrorCodes.SERVICE_UNAVAILABLE),
    timeout: (message) => new AppError(message || 'Request timeout', 504, ErrorCodes.TIMEOUT),
    externalService: (service, message) => {
        const error = new AppError(message || `External service error: ${service}`, 502, ErrorCodes.EXTERNAL_SERVICE_ERROR);
        error.service = service;
        return error;
    }
};

/**
 * Correlation ID middleware
 * Adds a unique ID to each request for tracking
 */
function correlationIdMiddleware() {
    return (req, res, next) => {
        // Use existing correlation ID from header or generate new one
        req.correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
        res.setHeader('X-Correlation-ID', req.correlationId);
        next();
    };
}

/**
 * 404 Not Found handler
 * Use this after all routes
 */
function notFoundHandler() {
    return (req, res, next) => {
        const error = createError.notFound(`Cannot ${req.method} ${req.path}`);
        next(error);
    };
}

/**
 * Main error handler middleware
 * Use this as the last middleware
 * 
 * @param {object} options - Error handler options
 * @param {boolean} options.includeStack - Include stack trace in response
 * @param {boolean} options.logErrors - Log errors to console
 */
function errorHandler(options = {}) {
    const {
        includeStack = process.env.NODE_ENV !== 'production',
        logErrors = true
    } = options;

    return (err, req, res, next) => {
        // Ensure we have a correlation ID
        const correlationId = req.correlationId || generateCorrelationId();

        // Determine status code and error code
        let statusCode = err.statusCode || err.status || 500;
        let errorCode = err.code || statusToCode[statusCode] || ErrorCodes.INTERNAL_ERROR;
        let message = err.message || 'An unexpected error occurred';

        // Handle specific error types
        if (err.name === 'ValidationError') {
            statusCode = 400;
            errorCode = ErrorCodes.VALIDATION_ERROR;
        } else if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
            statusCode = 400;
            errorCode = ErrorCodes.BAD_REQUEST;
            message = 'Invalid JSON in request body';
        } else if (err.code === 'LIMIT_FILE_SIZE') {
            statusCode = 413;
            errorCode = ErrorCodes.PAYLOAD_TOO_LARGE;
            message = 'File size exceeds limit';
        } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            statusCode = 503;
            errorCode = ErrorCodes.SERVICE_UNAVAILABLE;
            message = 'External service unavailable';
        } else if (err.name === 'TimeoutError' || err.code === 'ETIMEDOUT') {
            statusCode = 504;
            errorCode = ErrorCodes.TIMEOUT;
            message = 'Request timeout';
        }

        // Build error response
        const errorResponse = {
            success: false,
            error: {
                code: errorCode,
                message: message,
                correlationId: correlationId
            }
        };

        // Add details if available
        if (err.details) {
            errorResponse.error.details = err.details;
        }

        // Add retry-after for rate limit errors
        if (err.retryAfter) {
            errorResponse.error.retryAfter = err.retryAfter;
            res.setHeader('Retry-After', err.retryAfter);
        }

        // Add stack trace in development
        if (includeStack && err.stack) {
            errorResponse.error.stack = err.stack.split('\n');
        }

        // Log error
        if (logErrors) {
            const logData = {
                correlationId,
                statusCode,
                errorCode,
                message,
                path: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.headers['user-agent']
            };

            if (statusCode >= 500) {
                Logger.error('[Error Handler] Server error:', logData);
                if (err.stack) {
                    Logger.error('[Error Handler] Stack trace:', err.stack);
                }
            } else if (statusCode >= 400) {
                Logger.warn('[Error Handler] Client error:', logData);
            }
        }

        // Send response
        res.status(statusCode).json(errorResponse);
    };
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors
 * 
 * @param {function} fn - Async route handler
 * @returns {function} Express middleware
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Safe JSON parse
 * Parses JSON with error handling
 * 
 * @param {string} json - JSON string
 * @param {any} defaultValue - Default value on error
 * @returns {any} Parsed value or default
 */
function safeJsonParse(json, defaultValue = null) {
    try {
        return JSON.parse(json);
    } catch (error) {
        return defaultValue;
    }
}

module.exports = {
    ErrorCodes,
    AppError,
    createError,
    correlationIdMiddleware,
    notFoundHandler,
    errorHandler,
    asyncHandler,
    safeJsonParse,
    generateCorrelationId
};
