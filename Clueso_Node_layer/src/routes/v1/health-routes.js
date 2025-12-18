/**
 * Health Routes
 * REST API endpoints for health monitoring and metrics.
 */

const express = require('express');
const router = express.Router();
const healthService = require('../../services/health-service');
const { Logger } = require('../../config');

/**
 * GET /health
 * Basic health check (for load balancers)
 */
router.get('/', (req, res) => {
    try {
        const health = healthService.getBasicHealth();
        res.json(health);
    } catch (error) {
        Logger.error('[Health Routes] Error in basic health check:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

/**
 * GET /health/detailed
 * Detailed health report with all components
 */
router.get('/detailed', async (req, res) => {
    try {
        const health = await healthService.getDetailedHealth();

        // Return 503 if system is degraded
        const statusCode = health.status === 'healthy' ? 200 : 503;

        res.status(statusCode).json(health);
    } catch (error) {
        Logger.error('[Health Routes] Error in detailed health check:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /health/ready
 * Readiness probe (for Kubernetes)
 */
router.get('/ready', async (req, res) => {
    try {
        const dependencies = await healthService.checkDependencies();

        // Check if all critical dependencies are healthy
        const isReady = dependencies.filesystem.status !== 'unhealthy';

        if (isReady) {
            res.json({
                status: 'ready',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                status: 'not_ready',
                dependencies,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        Logger.error('[Health Routes] Error in readiness check:', error);
        res.status(503).json({
            status: 'not_ready',
            error: error.message
        });
    }
});

/**
 * GET /health/live
 * Liveness probe (for Kubernetes)
 */
router.get('/live', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /metrics
 * Request/response metrics
 */
router.get('/metrics', (req, res) => {
    try {
        const metrics = healthService.getMetrics();
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        Logger.error('[Health Routes] Error getting metrics:', error);
        res.status(500).json({
            success: false,
            error: { code: 'METRICS_ERROR', message: error.message }
        });
    }
});

/**
 * GET /metrics/system
 * System-level metrics (memory, CPU, etc.)
 */
router.get('/metrics/system', (req, res) => {
    try {
        const system = healthService.getSystemHealth();
        res.json({
            success: true,
            data: system
        });
    } catch (error) {
        Logger.error('[Health Routes] Error getting system metrics:', error);
        res.status(500).json({
            success: false,
            error: { code: 'SYSTEM_METRICS_ERROR', message: error.message }
        });
    }
});

/**
 * POST /metrics/reset
 * Reset all metrics (admin only)
 */
router.post('/metrics/reset', (req, res) => {
    try {
        healthService.resetMetrics();
        res.json({
            success: true,
            message: 'Metrics reset successfully'
        });
    } catch (error) {
        Logger.error('[Health Routes] Error resetting metrics:', error);
        res.status(500).json({
            success: false,
            error: { code: 'RESET_ERROR', message: error.message }
        });
    }
});

/**
 * GET /health/dependencies
 * Check all external dependencies
 */
router.get('/dependencies', async (req, res) => {
    try {
        const dependencies = await healthService.checkDependencies();

        // Determine if all dependencies are healthy
        const allHealthy = Object.values(dependencies).every(
            d => d.status === 'healthy' || d.status === 'configured'
        );

        res.status(allHealthy ? 200 : 503).json({
            success: true,
            allHealthy,
            data: dependencies
        });
    } catch (error) {
        Logger.error('[Health Routes] Error checking dependencies:', error);
        res.status(500).json({
            success: false,
            error: { code: 'DEPENDENCY_CHECK_ERROR', message: error.message }
        });
    }
});

module.exports = router;
