/**
 * Session Routes
 * REST API endpoints for session management.
 */

const express = require('express');
const router = express.Router();
const sessionService = require('../../services/session-service');
const { validate, schemas } = require('../../middlewares/validator');
const { Logger } = require('../../config');

/**
 * GET /sessions
 * List all sessions with pagination
 */
router.get('/', validate({
    query: {
        properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
            state: {
                type: 'string',
                enum: ['created', 'recording', 'processing', 'completed', 'failed']
            },
            sort: { type: 'string', enum: ['asc', 'desc'] }
        }
    }
}), (req, res) => {
    try {
        const { limit = 50, offset = 0, state, sort = 'desc' } = req.query;

        const result = sessionService.listSessions({
            limit: parseInt(limit),
            offset: parseInt(offset),
            state,
            sort
        });

        res.json({
            success: true,
            data: result.sessions,
            pagination: result.pagination
        });
    } catch (error) {
        Logger.error('[Session Routes] Error listing sessions:', error);
        res.status(500).json({
            success: false,
            error: { code: 'LIST_ERROR', message: error.message }
        });
    }
});

/**
 * POST /sessions
 * Create a new session
 */
router.post('/', validate({
    body: {
        type: 'object',
        properties: {
            url: { type: 'string' },
            viewport: { type: 'object' },
            metadata: { type: 'object' }
        }
    }
}), (req, res) => {
    try {
        const session = sessionService.createSession(req.body);

        res.status(201).json({
            success: true,
            data: session
        });
    } catch (error) {
        Logger.error('[Session Routes] Error creating session:', error);
        res.status(500).json({
            success: false,
            error: { code: 'CREATE_ERROR', message: error.message }
        });
    }
});

/**
 * GET /sessions/stats
 * Get aggregate session statistics
 */
router.get('/stats', (req, res) => {
    try {
        const stats = sessionService.getStatistics();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        Logger.error('[Session Routes] Error getting statistics:', error);
        res.status(500).json({
            success: false,
            error: { code: 'STATS_ERROR', message: error.message }
        });
    }
});

/**
 * GET /sessions/:sessionId
 * Get a specific session
 */
router.get('/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessionService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Session not found' }
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        Logger.error('[Session Routes] Error getting session:', error);
        res.status(500).json({
            success: false,
            error: { code: 'GET_ERROR', message: error.message }
        });
    }
});

/**
 * PATCH /sessions/:sessionId
 * Update a session
 */
router.patch('/:sessionId', validate({
    body: {
        type: 'object',
        properties: {
            state: {
                type: 'string',
                enum: ['created', 'recording', 'processing', 'completed', 'failed']
            },
            metadata: { type: 'object' },
            stats: { type: 'object' },
            files: { type: 'object' }
        }
    }
}), (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessionService.updateSession(sessionId, req.body);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Session not found' }
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        Logger.error('[Session Routes] Error updating session:', error);
        res.status(500).json({
            success: false,
            error: { code: 'UPDATE_ERROR', message: error.message }
        });
    }
});

/**
 * DELETE /sessions/:sessionId
 * Delete a session
 */
router.delete('/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const deleted = sessionService.deleteSession(sessionId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Session not found' }
            });
        }

        res.json({
            success: true,
            message: 'Session deleted successfully'
        });
    } catch (error) {
        Logger.error('[Session Routes] Error deleting session:', error);
        res.status(500).json({
            success: false,
            error: { code: 'DELETE_ERROR', message: error.message }
        });
    }
});

/**
 * GET /sessions/:sessionId/status
 * Get session processing status
 */
router.get('/:sessionId/status', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessionService.getSession(sessionId);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Session not found' }
            });
        }

        res.json({
            success: true,
            data: {
                sessionId: session.id,
                state: session.state,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                hasErrors: session.errors.length > 0,
                errorCount: session.errors.length,
                stats: session.stats
            }
        });
    } catch (error) {
        Logger.error('[Session Routes] Error getting session status:', error);
        res.status(500).json({
            success: false,
            error: { code: 'STATUS_ERROR', message: error.message }
        });
    }
});

/**
 * POST /sessions/:sessionId/events
 * Add events to a session
 */
router.post('/:sessionId/events', validate({
    body: {
        type: 'object',
        properties: {
            events: { type: 'array', required: true, minItems: 1 }
        },
        required: ['events']
    }
}), (req, res) => {
    try {
        const { sessionId } = req.params;
        const { events } = req.body;

        const session = sessionService.addEvents(sessionId, events);

        if (!session) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Session not found' }
            });
        }

        res.json({
            success: true,
            data: {
                sessionId: session.id,
                eventCount: session.stats.eventCount
            }
        });
    } catch (error) {
        Logger.error('[Session Routes] Error adding events:', error);
        res.status(500).json({
            success: false,
            error: { code: 'ADD_EVENTS_ERROR', message: error.message }
        });
    }
});

/**
 * POST /sessions/cleanup
 * Clean up old sessions
 */
router.post('/cleanup', validate({
    body: {
        type: 'object',
        properties: {
            maxAgeDays: { type: 'integer', minimum: 1, maximum: 365 }
        }
    }
}), (req, res) => {
    try {
        const { maxAgeDays = 7 } = req.body;
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

        const deleted = sessionService.cleanupOldSessions(maxAgeMs);

        res.json({
            success: true,
            data: {
                deletedCount: deleted,
                maxAgeDays
            }
        });
    } catch (error) {
        Logger.error('[Session Routes] Error cleaning up sessions:', error);
        res.status(500).json({
            success: false,
            error: { code: 'CLEANUP_ERROR', message: error.message }
        });
    }
});

module.exports = router;
