/**
 * Batch Routes
 * REST API endpoints for batch processing.
 */

const express = require('express');
const router = express.Router();
const batchService = require('../../services/batch-service');
const sessionService = require('../../services/session-service');
const PythonService = require('../../services/python-service');
const { validate } = require('../../middlewares/validator');
const { usePreset } = require('../../middlewares/rate-limiter');
const { Logger } = require('../../config');

// Apply rate limiting for batch operations
const batchRateLimiter = usePreset('aiProcessing', { max: 10 });

/**
 * POST /batch/process
 * Submit a batch job for processing sessions
 */
router.post('/process', batchRateLimiter, validate({
    body: {
        type: 'object',
        properties: {
            sessions: {
                type: 'array',
                required: true,
                minItems: 1,
                maxItems: 50,
                items: { type: 'string' }
            },
            options: {
                type: 'object',
                properties: {
                    retries: { type: 'integer', minimum: 1, maximum: 5 },
                    generateSummary: { type: 'boolean' },
                    generateAudio: { type: 'boolean' }
                }
            }
        },
        required: ['sessions']
    }
}), async (req, res) => {
    try {
        const { sessions, options = {} } = req.body;

        // Create batch
        const batch = batchService.createBatch({
            items: sessions,
            operation: 'process',
            options
        });

        // Start processing in background
        setImmediate(async () => {
            try {
                await batchService.processBatch(batch.id, async (sessionId) => {
                    // Get session
                    const session = sessionService.getSession(sessionId);
                    if (!session) {
                        throw new Error(`Session not found: ${sessionId}`);
                    }

                    // Process with Python service if events exist
                    if (session.events && session.events.length > 0) {
                        const result = await PythonService.sendTextWithDomEvents(
                            session.events.map(e => e.action).join(' '),
                            session.events,
                            session.metadata
                        );

                        // Update session
                        sessionService.updateSession(sessionId, {
                            state: 'completed',
                            stats: {
                                ...session.stats,
                                processedAt: new Date().toISOString()
                            }
                        });

                        return result;
                    }

                    return { status: 'no_events' };
                });
            } catch (error) {
                Logger.error(`[Batch Routes] Batch processing failed: ${error.message}`);
            }
        });

        res.status(202).json({
            success: true,
            data: {
                batchId: batch.id,
                state: batch.state,
                progress: batch.progress,
                message: 'Batch processing started'
            }
        });
    } catch (error) {
        Logger.error('[Batch Routes] Error creating batch:', error);
        res.status(500).json({
            success: false,
            error: { code: 'BATCH_CREATE_ERROR', message: error.message }
        });
    }
});

/**
 * GET /batch
 * List all batch jobs
 */
router.get('/', validate({
    query: {
        properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            state: {
                type: 'string',
                enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'partial']
            }
        }
    }
}), (req, res) => {
    try {
        const { limit = 50, state } = req.query;

        const batches = batchService.listBatches({
            limit: parseInt(limit),
            state
        });

        res.json({
            success: true,
            data: batches,
            count: batches.length
        });
    } catch (error) {
        Logger.error('[Batch Routes] Error listing batches:', error);
        res.status(500).json({
            success: false,
            error: { code: 'LIST_ERROR', message: error.message }
        });
    }
});

/**
 * GET /batch/:batchId
 * Get batch details
 */
router.get('/:batchId', (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = batchService.getBatch(batchId);

        if (!batch) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Batch not found' }
            });
        }

        res.json({
            success: true,
            data: batch
        });
    } catch (error) {
        Logger.error('[Batch Routes] Error getting batch:', error);
        res.status(500).json({
            success: false,
            error: { code: 'GET_ERROR', message: error.message }
        });
    }
});

/**
 * GET /batch/:batchId/progress
 * Get batch progress
 */
router.get('/:batchId/progress', (req, res) => {
    try {
        const { batchId } = req.params;
        const progress = batchService.getBatchProgress(batchId);

        if (!progress) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Batch not found' }
            });
        }

        res.json({
            success: true,
            data: progress
        });
    } catch (error) {
        Logger.error('[Batch Routes] Error getting progress:', error);
        res.status(500).json({
            success: false,
            error: { code: 'PROGRESS_ERROR', message: error.message }
        });
    }
});

/**
 * DELETE /batch/:batchId
 * Cancel or delete a batch
 */
router.delete('/:batchId', (req, res) => {
    try {
        const { batchId } = req.params;
        const batch = batchService.getBatch(batchId);

        if (!batch) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Batch not found' }
            });
        }

        // If processing, cancel it
        if (batch.state === 'processing' || batch.state === 'pending') {
            const cancelled = batchService.cancelBatch(batchId);
            if (cancelled) {
                return res.json({
                    success: true,
                    message: 'Batch cancelled successfully'
                });
            }
        }

        // Otherwise, try to delete
        const deleted = batchService.deleteBatch(batchId);
        if (deleted) {
            return res.json({
                success: true,
                message: 'Batch deleted successfully'
            });
        }

        res.status(400).json({
            success: false,
            error: {
                code: 'CANNOT_DELETE',
                message: 'Cannot delete batch in current state'
            }
        });
    } catch (error) {
        Logger.error('[Batch Routes] Error deleting batch:', error);
        res.status(500).json({
            success: false,
            error: { code: 'DELETE_ERROR', message: error.message }
        });
    }
});

/**
 * POST /batch/:batchId/cancel
 * Cancel a running batch
 */
router.post('/:batchId/cancel', (req, res) => {
    try {
        const { batchId } = req.params;
        const cancelled = batchService.cancelBatch(batchId);

        if (!cancelled) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'CANNOT_CANCEL',
                    message: 'Batch cannot be cancelled (not found or already completed)'
                }
            });
        }

        res.json({
            success: true,
            message: 'Batch cancelled successfully'
        });
    } catch (error) {
        Logger.error('[Batch Routes] Error cancelling batch:', error);
        res.status(500).json({
            success: false,
            error: { code: 'CANCEL_ERROR', message: error.message }
        });
    }
});

module.exports = router;
