/**
 * Health & Metrics Service
 * Monitors system health and collects performance metrics.
 * 
 * Features:
 * - System health checks (memory, CPU, uptime)
 * - Dependency health (Deepgram, ProductAI)
 * - Request/response metrics
 * - Error rate tracking
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { Logger } = require('../config');
const PythonService = require('./python-service');

// Metrics storage
const metrics = {
    requests: {
        total: 0,
        success: 0,
        error: 0,
        byEndpoint: {},
        byStatusCode: {}
    },
    responseTimes: [],
    startTime: Date.now(),
    lastUpdated: Date.now()
};

// Max stored response times (for average calculation)
const MAX_RESPONSE_TIMES = 1000;

/**
 * Record a request metric
 * 
 * @param {object} data - Request data
 * @param {string} data.endpoint - API endpoint
 * @param {string} data.method - HTTP method
 * @param {number} data.statusCode - Response status code
 * @param {number} data.responseTime - Response time in ms
 */
function recordRequest(data) {
    const { endpoint, method, statusCode, responseTime } = data;

    metrics.requests.total++;

    if (statusCode >= 200 && statusCode < 400) {
        metrics.requests.success++;
    } else {
        metrics.requests.error++;
    }

    // Track by endpoint
    const endpointKey = `${method} ${endpoint}`;
    if (!metrics.requests.byEndpoint[endpointKey]) {
        metrics.requests.byEndpoint[endpointKey] = { count: 0, avgTime: 0, totalTime: 0 };
    }
    metrics.requests.byEndpoint[endpointKey].count++;
    metrics.requests.byEndpoint[endpointKey].totalTime += responseTime;
    metrics.requests.byEndpoint[endpointKey].avgTime =
        metrics.requests.byEndpoint[endpointKey].totalTime /
        metrics.requests.byEndpoint[endpointKey].count;

    // Track by status code
    metrics.requests.byStatusCode[statusCode] =
        (metrics.requests.byStatusCode[statusCode] || 0) + 1;

    // Track response times
    metrics.responseTimes.push(responseTime);
    if (metrics.responseTimes.length > MAX_RESPONSE_TIMES) {
        metrics.responseTimes.shift();
    }

    metrics.lastUpdated = Date.now();
}

/**
 * Create metrics middleware
 * Tracks request/response metrics for all endpoints.
 * 
 * @returns {function} Express middleware
 */
function metricsMiddleware() {
    return (req, res, next) => {
        const startTime = Date.now();

        // Capture response finish
        res.on('finish', () => {
            const responseTime = Date.now() - startTime;

            recordRequest({
                endpoint: req.route?.path || req.path,
                method: req.method,
                statusCode: res.statusCode,
                responseTime
            });
        });

        next();
    };
}

/**
 * Get system health information
 * 
 * @returns {object} System health data
 */
function getSystemHealth() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
        status: 'healthy',
        uptime: {
            seconds: Math.floor((Date.now() - metrics.startTime) / 1000),
            formatted: formatUptime(Date.now() - metrics.startTime)
        },
        memory: {
            total: formatBytes(totalMem),
            used: formatBytes(usedMem),
            free: formatBytes(freeMem),
            usagePercent: Math.round((usedMem / totalMem) * 100)
        },
        cpu: {
            cores: os.cpus().length,
            model: os.cpus()[0]?.model || 'Unknown',
            loadAverage: os.loadavg()
        },
        platform: {
            os: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version
        }
    };
}

/**
 * Check dependency health
 * 
 * @returns {Promise<object>} Dependency health status
 */
async function checkDependencies() {
    const dependencies = {
        productAI: { status: 'unknown', latency: null },
        deepgram: { status: 'unknown', latency: null },
        filesystem: { status: 'unknown' }
    };

    // Check ProductAI
    try {
        const startTime = Date.now();
        const isHealthy = await PythonService.healthCheck();
        dependencies.productAI = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            latency: Date.now() - startTime
        };
    } catch (error) {
        dependencies.productAI = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Check Deepgram (API key presence)
    dependencies.deepgram = {
        status: process.env.DEEPGRAM_API_KEY ? 'configured' : 'not_configured'
    };

    // Check filesystem (recordings directory)
    try {
        const recordingsDir = path.join(__dirname, '..', 'recordings');
        if (fs.existsSync(recordingsDir)) {
            const stats = fs.statSync(recordingsDir);
            dependencies.filesystem = {
                status: 'healthy',
                recordingsDir: {
                    exists: true,
                    writable: true
                }
            };
        } else {
            dependencies.filesystem = {
                status: 'warning',
                message: 'Recordings directory does not exist'
            };
        }
    } catch (error) {
        dependencies.filesystem = {
            status: 'unhealthy',
            error: error.message
        };
    }

    return dependencies;
}

/**
 * Get request metrics
 * 
 * @returns {object} Request metrics
 */
function getMetrics() {
    const responseTimes = metrics.responseTimes;

    // Calculate response time stats
    let avgResponseTime = 0;
    let minResponseTime = 0;
    let maxResponseTime = 0;
    let p95ResponseTime = 0;

    if (responseTimes.length > 0) {
        const sorted = [...responseTimes].sort((a, b) => a - b);
        avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        minResponseTime = sorted[0];
        maxResponseTime = sorted[sorted.length - 1];
        p95ResponseTime = sorted[Math.floor(sorted.length * 0.95)] || maxResponseTime;
    }

    const errorRate = metrics.requests.total > 0
        ? (metrics.requests.error / metrics.requests.total * 100).toFixed(2)
        : 0;

    return {
        requests: {
            total: metrics.requests.total,
            success: metrics.requests.success,
            error: metrics.requests.error,
            errorRate: `${errorRate}%`
        },
        responseTime: {
            average: Math.round(avgResponseTime),
            min: minResponseTime,
            max: maxResponseTime,
            p95: p95ResponseTime,
            unit: 'ms'
        },
        endpoints: metrics.requests.byEndpoint,
        statusCodes: metrics.requests.byStatusCode,
        uptime: {
            seconds: Math.floor((Date.now() - metrics.startTime) / 1000),
            formatted: formatUptime(Date.now() - metrics.startTime)
        },
        lastUpdated: new Date(metrics.lastUpdated).toISOString()
    };
}

/**
 * Get basic health check response
 * 
 * @returns {object} Basic health response
 */
function getBasicHealth() {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - metrics.startTime) / 1000)
    };
}

/**
 * Get detailed health report
 * 
 * @returns {Promise<object>} Detailed health report
 */
async function getDetailedHealth() {
    const system = getSystemHealth();
    const dependencies = await checkDependencies();
    const requestMetrics = getMetrics();

    // Determine overall status
    const hasUnhealthy = Object.values(dependencies).some(d => d.status === 'unhealthy');
    const overallStatus = hasUnhealthy ? 'degraded' : 'healthy';

    return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        system,
        dependencies,
        metrics: requestMetrics
    };
}

/**
 * Reset metrics
 */
function resetMetrics() {
    metrics.requests = {
        total: 0,
        success: 0,
        error: 0,
        byEndpoint: {},
        byStatusCode: {}
    };
    metrics.responseTimes = [];
    metrics.lastUpdated = Date.now();
    Logger.info('[Health Service] Metrics reset');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format uptime to human readable
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = {
    metricsMiddleware,
    recordRequest,
    getSystemHealth,
    checkDependencies,
    getMetrics,
    getBasicHealth,
    getDetailedHealth,
    resetMetrics
};
