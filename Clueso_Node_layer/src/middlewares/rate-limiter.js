/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse using a token bucket algorithm.
 * 
 * Features:
 * - Per-IP rate limiting
 * - Configurable windows and limits
 * - Returns 429 with Retry-After header
 * - Memory-efficient with automatic cleanup
 */

const { Logger } = require('../config');

// In-memory store for rate limiting (production: use Redis)
const rateLimitStore = new Map();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Clean up expired entries from the store
 */
function cleanupExpiredEntries() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, data] of rateLimitStore.entries()) {
        if (now > data.resetTime) {
            rateLimitStore.delete(key);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        Logger.debug(`[Rate Limiter] Cleaned up ${cleaned} expired entries`);
    }
}

// Start cleanup interval
setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL);

/**
 * Get client identifier from request
 * Uses X-Forwarded-For if behind proxy, otherwise req.ip
 */
function getClientId(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Rate limiter configuration defaults
 */
const defaults = {
    windowMs: 60 * 1000,      // 1 minute window
    max: 100,                  // 100 requests per window
    message: 'Too many requests, please try again later.',
    statusCode: 429,
    headers: true,             // Send rate limit headers
    keyGenerator: getClientId, // Function to generate key
    skip: () => false,         // Skip certain requests
    onLimitReached: null       // Callback when limit reached
};

/**
 * Create rate limiter middleware
 * 
 * @param {object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.message - Error message when limit exceeded
 * @param {number} options.statusCode - HTTP status code (default: 429)
 * @param {boolean} options.headers - Whether to send rate limit headers
 * @param {function} options.keyGenerator - Function to generate client key
 * @param {function} options.skip - Function to skip rate limiting
 * @param {function} options.onLimitReached - Callback when limit is reached
 * @returns {function} Express middleware
 */
function rateLimiter(options = {}) {
    const config = { ...defaults, ...options };

    return (req, res, next) => {
        try {
            // Skip if configured to skip this request
            if (config.skip(req, res)) {
                return next();
            }

            const key = config.keyGenerator(req);
            const now = Date.now();

            // Get or create rate limit data for this key
            let data = rateLimitStore.get(key);

            if (!data || now > data.resetTime) {
                // Create new window
                data = {
                    count: 0,
                    resetTime: now + config.windowMs,
                    firstRequest: now
                };
            }

            // Increment request count
            data.count++;
            rateLimitStore.set(key, data);

            // Calculate remaining requests and reset time
            const remaining = Math.max(0, config.max - data.count);
            const resetSeconds = Math.ceil((data.resetTime - now) / 1000);

            // Set rate limit headers if enabled
            if (config.headers) {
                res.setHeader('X-RateLimit-Limit', config.max);
                res.setHeader('X-RateLimit-Remaining', remaining);
                res.setHeader('X-RateLimit-Reset', Math.ceil(data.resetTime / 1000));
                res.setHeader('X-RateLimit-Policy', `${config.max};w=${Math.ceil(config.windowMs / 1000)}`);
            }

            // Check if limit exceeded
            if (data.count > config.max) {
                Logger.warn(`[Rate Limiter] Rate limit exceeded for ${key}: ${data.count}/${config.max}`);

                // Set Retry-After header
                res.setHeader('Retry-After', resetSeconds);

                // Call onLimitReached callback if provided
                if (config.onLimitReached) {
                    config.onLimitReached(req, res, { key, count: data.count, limit: config.max });
                }

                return res.status(config.statusCode).json({
                    success: false,
                    error: {
                        code: 'RATE_LIMIT_EXCEEDED',
                        message: config.message,
                        retryAfter: resetSeconds
                    }
                });
            }

            next();
        } catch (error) {
            Logger.error('[Rate Limiter] Error:', error);
            // Don't block request on rate limiter errors
            next();
        }
    };
}

/**
 * Preset configurations for common use cases
 */
const presets = {
    // Strict: 10 requests per minute (for sensitive endpoints)
    strict: {
        windowMs: 60 * 1000,
        max: 10,
        message: 'Rate limit exceeded. This endpoint is rate-limited to 10 requests per minute.'
    },

    // Standard: 100 requests per minute
    standard: {
        windowMs: 60 * 1000,
        max: 100,
        message: 'Too many requests, please try again later.'
    },

    // Lenient: 500 requests per minute (for high-traffic endpoints)
    lenient: {
        windowMs: 60 * 1000,
        max: 500,
        message: 'Request limit exceeded. Please slow down.'
    },

    // Upload: 20 uploads per minute
    upload: {
        windowMs: 60 * 1000,
        max: 20,
        message: 'Upload limit exceeded. Please wait before uploading more files.'
    },

    // AI Processing: 5 requests per minute (expensive operations)
    aiProcessing: {
        windowMs: 60 * 1000,
        max: 5,
        message: 'AI processing rate limit exceeded. These operations are resource-intensive.'
    }
};

/**
 * Create a rate limiter using a preset
 * 
 * @param {string} presetName - Name of the preset
 * @param {object} overrides - Override preset values
 * @returns {function} Express middleware
 */
function usePreset(presetName, overrides = {}) {
    const preset = presets[presetName];
    if (!preset) {
        throw new Error(`Unknown rate limiter preset: ${presetName}`);
    }
    return rateLimiter({ ...preset, ...overrides });
}

/**
 * Get current rate limit stats for a key
 * 
 * @param {string} key - Client key
 * @returns {object|null} Rate limit data or null
 */
function getStats(key) {
    const data = rateLimitStore.get(key);
    if (!data) return null;

    const now = Date.now();
    return {
        count: data.count,
        remaining: Math.max(0, defaults.max - data.count),
        resetTime: data.resetTime,
        resetIn: Math.max(0, data.resetTime - now),
        isLimited: data.count > defaults.max
    };
}

/**
 * Reset rate limit for a specific key
 * 
 * @param {string} key - Client key to reset
 */
function resetKey(key) {
    rateLimitStore.delete(key);
    Logger.info(`[Rate Limiter] Reset rate limit for key: ${key}`);
}

/**
 * Get total number of tracked clients
 * 
 * @returns {number} Number of clients being tracked
 */
function getClientCount() {
    return rateLimitStore.size;
}

module.exports = {
    rateLimiter,
    usePreset,
    presets,
    getStats,
    resetKey,
    getClientCount,
    getClientId
};
