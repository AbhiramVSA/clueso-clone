/**
 * Batch Processing Service
 * Queue-based processing for bulk recording operations.
 * 
 * Features:
 * - Queue management for batch jobs
 * - Progress tracking
 * - Retry with exponential backoff
 * - Status webhooks
 */

const { Logger } = require('../config');
const EventEmitter = require('events');

// Batch job states
const BatchState = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    PARTIAL: 'partial'
};

// Batch jobs storage
const batchJobs = new Map();

// Event emitter for batch events
const batchEvents = new EventEmitter();

/**
 * Generate a unique batch ID
 */
function generateBatchId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `batch_${timestamp}_${random}`;
}

/**
 * Create a new batch job
 * 
 * @param {object} options - Batch options
 * @param {Array} options.items - Items to process
 * @param {string} options.operation - Operation type
 * @param {object} options.options - Processing options
 * @returns {object} Created batch job
 */
function createBatch(options = {}) {
    const { items = [], operation = 'process', options: processOptions = {} } = options;

    const batchId = generateBatchId();
    const now = new Date().toISOString();

    const batch = {
        id: batchId,
        state: BatchState.PENDING,
        operation,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        items: items.map((item, index) => ({
            index,
            id: typeof item === 'string' ? item : item.id,
            data: typeof item === 'object' ? item : null,
            state: BatchState.PENDING,
            result: null,
            error: null,
            attempts: 0,
            startedAt: null,
            completedAt: null
        })),
        progress: {
            total: items.length,
            completed: 0,
            failed: 0,
            pending: items.length,
            processing: 0,
            percentComplete: 0
        },
        options: processOptions,
        results: [],
        errors: []
    };

    batchJobs.set(batchId, batch);
    Logger.info(`[Batch Service] Created batch ${batchId} with ${items.length} items`);

    return batch;
}

/**
 * Start processing a batch job
 * 
 * @param {string} batchId - Batch ID
 * @param {function} processor - Async function to process each item
 * @returns {Promise<object>} Completed batch
 */
async function processBatch(batchId, processor) {
    const batch = batchJobs.get(batchId);
    if (!batch) {
        throw new Error(`Batch not found: ${batchId}`);
    }

    if (batch.state !== BatchState.PENDING) {
        throw new Error(`Batch ${batchId} is not in pending state`);
    }

    batch.state = BatchState.PROCESSING;
    batch.startedAt = new Date().toISOString();
    batch.updatedAt = batch.startedAt;

    batchEvents.emit('started', { batchId, total: batch.items.length });
    Logger.info(`[Batch Service] Started processing batch ${batchId}`);

    // Process items sequentially
    for (const item of batch.items) {
        // Check if cancelled
        if (batch.state === BatchState.CANCELLED) {
            Logger.info(`[Batch Service] Batch ${batchId} was cancelled`);
            break;
        }

        await processItem(batch, item, processor);
    }

    // Finalize batch
    finalizeBatch(batch);

    return batch;
}

/**
 * Process a single item with retry logic
 */
async function processItem(batch, item, processor, maxRetries = 3) {
    item.state = BatchState.PROCESSING;
    item.startedAt = new Date().toISOString();
    batch.progress.pending--;
    batch.progress.processing++;
    batch.updatedAt = new Date().toISOString();

    batchEvents.emit('itemStarted', {
        batchId: batch.id,
        itemIndex: item.index,
        itemId: item.id
    });

    let lastError = null;

    while (item.attempts < maxRetries) {
        item.attempts++;

        try {
            const result = await processor(item.id, item.data);

            // Success
            item.state = BatchState.COMPLETED;
            item.result = result;
            item.completedAt = new Date().toISOString();
            batch.progress.processing--;
            batch.progress.completed++;
            batch.results.push({
                index: item.index,
                id: item.id,
                result
            });

            batchEvents.emit('itemCompleted', {
                batchId: batch.id,
                itemIndex: item.index,
                itemId: item.id,
                result
            });

            updateProgress(batch);
            return;
        } catch (error) {
            lastError = error;
            Logger.warn(`[Batch Service] Item ${item.id} attempt ${item.attempts} failed: ${error.message}`);

            // Wait before retry (exponential backoff)
            if (item.attempts < maxRetries) {
                const delay = Math.pow(2, item.attempts) * 1000;
                await sleep(delay);
            }
        }
    }

    // All retries failed
    item.state = BatchState.FAILED;
    item.error = lastError?.message || 'Unknown error';
    item.completedAt = new Date().toISOString();
    batch.progress.processing--;
    batch.progress.failed++;
    batch.errors.push({
        index: item.index,
        id: item.id,
        error: item.error,
        attempts: item.attempts
    });

    batchEvents.emit('itemFailed', {
        batchId: batch.id,
        itemIndex: item.index,
        itemId: item.id,
        error: item.error
    });

    updateProgress(batch);
}

/**
 * Update batch progress
 */
function updateProgress(batch) {
    batch.progress.percentComplete = Math.round(
        ((batch.progress.completed + batch.progress.failed) / batch.progress.total) * 100
    );
    batch.updatedAt = new Date().toISOString();

    batchEvents.emit('progress', {
        batchId: batch.id,
        progress: batch.progress
    });
}

/**
 * Finalize batch after processing
 */
function finalizeBatch(batch) {
    batch.completedAt = new Date().toISOString();
    batch.updatedAt = batch.completedAt;

    if (batch.state === BatchState.CANCELLED) {
        // Keep cancelled state
    } else if (batch.progress.failed === 0) {
        batch.state = BatchState.COMPLETED;
    } else if (batch.progress.completed === 0) {
        batch.state = BatchState.FAILED;
    } else {
        batch.state = BatchState.PARTIAL;
    }

    batchEvents.emit('completed', {
        batchId: batch.id,
        state: batch.state,
        progress: batch.progress
    });

    Logger.info(`[Batch Service] Batch ${batch.id} finished with state: ${batch.state}`);
}

/**
 * Get batch by ID
 * 
 * @param {string} batchId - Batch ID
 * @returns {object|null} Batch or null
 */
function getBatch(batchId) {
    return batchJobs.get(batchId) || null;
}

/**
 * Get batch progress
 * 
 * @param {string} batchId - Batch ID
 * @returns {object|null} Progress or null
 */
function getBatchProgress(batchId) {
    const batch = batchJobs.get(batchId);
    if (!batch) return null;

    return {
        batchId: batch.id,
        state: batch.state,
        progress: batch.progress,
        startedAt: batch.startedAt,
        completedAt: batch.completedAt,
        duration: batch.startedAt ? calculateDuration(batch.startedAt, batch.completedAt) : null
    };
}

/**
 * Cancel a batch
 * 
 * @param {string} batchId - Batch ID
 * @returns {boolean} True if cancelled
 */
function cancelBatch(batchId) {
    const batch = batchJobs.get(batchId);
    if (!batch) return false;

    if (batch.state === BatchState.COMPLETED || batch.state === BatchState.FAILED) {
        return false;
    }

    batch.state = BatchState.CANCELLED;
    batch.updatedAt = new Date().toISOString();

    batchEvents.emit('cancelled', { batchId });
    Logger.info(`[Batch Service] Batch ${batchId} cancelled`);

    return true;
}

/**
 * List all batches
 * 
 * @param {object} options - List options
 * @returns {Array} List of batches
 */
function listBatches(options = {}) {
    const { limit = 50, state } = options;

    let batches = Array.from(batchJobs.values());

    if (state) {
        batches = batches.filter(b => b.state === state);
    }

    // Sort by creation date descending
    batches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return batches.slice(0, limit).map(b => ({
        id: b.id,
        state: b.state,
        operation: b.operation,
        progress: b.progress,
        createdAt: b.createdAt,
        completedAt: b.completedAt
    }));
}

/**
 * Delete a batch
 * 
 * @param {string} batchId - Batch ID
 * @returns {boolean} True if deleted
 */
function deleteBatch(batchId) {
    const batch = batchJobs.get(batchId);
    if (!batch) return false;

    // Only delete completed/failed/cancelled batches
    if (batch.state === BatchState.PROCESSING) {
        return false;
    }

    batchJobs.delete(batchId);
    Logger.info(`[Batch Service] Deleted batch ${batchId}`);
    return true;
}

/**
 * Subscribe to batch events
 * 
 * @param {string} event - Event name
 * @param {function} handler - Event handler
 */
function subscribe(event, handler) {
    batchEvents.on(event, handler);
}

/**
 * Unsubscribe from batch events
 * 
 * @param {string} event - Event name
 * @param {function} handler - Event handler
 */
function unsubscribe(event, handler) {
    batchEvents.off(event, handler);
}

/**
 * Helper: Sleep for ms
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper: Calculate duration between two dates
 */
function calculateDuration(startIso, endIso) {
    const start = new Date(startIso).getTime();
    const end = endIso ? new Date(endIso).getTime() : Date.now();
    const ms = end - start;

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = {
    BatchState,
    createBatch,
    processBatch,
    getBatch,
    getBatchProgress,
    cancelBatch,
    listBatches,
    deleteBatch,
    subscribe,
    unsubscribe
};
