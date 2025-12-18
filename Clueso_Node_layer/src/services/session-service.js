/**
 * Session Management Service
 * Tracks recording session lifecycle with statistics and metadata.
 * 
 * Features:
 * - Session creation, update, and retrieval
 * - State tracking: recording, processing, completed, failed
 * - Session metadata (duration, events, file sizes)
 * - Automatic cleanup of old sessions
 */

const fs = require('fs');
const path = require('path');
const { Logger } = require('../config');

// Session states
const SessionState = {
    CREATED: 'created',
    RECORDING: 'recording',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// In-memory session store (with file persistence)
const sessions = new Map();

// Sessions directory
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `session_${timestamp}_${random}`;
}

/**
 * Create a new session
 * 
 * @param {object} options - Session options
 * @returns {object} Created session
 */
function createSession(options = {}) {
    const sessionId = options.sessionId || generateSessionId();
    const now = new Date().toISOString();

    const session = {
        id: sessionId,
        state: SessionState.CREATED,
        createdAt: now,
        updatedAt: now,
        metadata: {
            url: options.url || null,
            viewport: options.viewport || null,
            userAgent: options.userAgent || null,
            ...options.metadata
        },
        stats: {
            duration: 0,
            eventCount: 0,
            videoSize: 0,
            audioSize: 0,
            processedAt: null
        },
        files: {
            video: null,
            audio: null,
            processedAudio: null
        },
        events: [],
        errors: []
    };

    sessions.set(sessionId, session);
    saveSession(session);

    Logger.info(`[Session Service] Created session: ${sessionId}`);
    return session;
}

/**
 * Get a session by ID
 * 
 * @param {string} sessionId - Session ID
 * @returns {object|null} Session or null
 */
function getSession(sessionId) {
    // Check memory first
    if (sessions.has(sessionId)) {
        return sessions.get(sessionId);
    }

    // Try loading from file
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            sessions.set(sessionId, data);
            return data;
        } catch (error) {
            Logger.error(`[Session Service] Error loading session ${sessionId}:`, error);
        }
    }

    return null;
}

/**
 * Update a session
 * 
 * @param {string} sessionId - Session ID
 * @param {object} updates - Updates to apply
 * @returns {object|null} Updated session or null
 */
function updateSession(sessionId, updates) {
    const session = getSession(sessionId);
    if (!session) {
        Logger.warn(`[Session Service] Session not found: ${sessionId}`);
        return null;
    }

    // Apply updates
    Object.assign(session, {
        ...updates,
        updatedAt: new Date().toISOString()
    });

    // Deep merge for nested objects
    if (updates.metadata) {
        session.metadata = { ...session.metadata, ...updates.metadata };
    }
    if (updates.stats) {
        session.stats = { ...session.stats, ...updates.stats };
    }
    if (updates.files) {
        session.files = { ...session.files, ...updates.files };
    }

    sessions.set(sessionId, session);
    saveSession(session);

    Logger.info(`[Session Service] Updated session: ${sessionId}`);
    return session;
}

/**
 * Update session state
 * 
 * @param {string} sessionId - Session ID
 * @param {string} state - New state
 * @param {object} data - Additional data
 * @returns {object|null} Updated session
 */
function updateState(sessionId, state, data = {}) {
    if (!Object.values(SessionState).includes(state)) {
        throw new Error(`Invalid session state: ${state}`);
    }

    return updateSession(sessionId, { state, ...data });
}

/**
 * Add events to a session
 * 
 * @param {string} sessionId - Session ID
 * @param {Array} events - Events to add
 * @returns {object|null} Updated session
 */
function addEvents(sessionId, events) {
    const session = getSession(sessionId);
    if (!session) return null;

    session.events = [...session.events, ...events];
    session.stats.eventCount = session.events.length;
    session.updatedAt = new Date().toISOString();

    sessions.set(sessionId, session);
    saveSession(session);

    Logger.info(`[Session Service] Added ${events.length} events to session: ${sessionId}`);
    return session;
}

/**
 * Record an error for a session
 * 
 * @param {string} sessionId - Session ID
 * @param {Error|string} error - Error to record
 * @returns {object|null} Updated session
 */
function recordError(sessionId, error) {
    const session = getSession(sessionId);
    if (!session) return null;

    session.errors.push({
        message: error.message || error,
        stack: error.stack || null,
        timestamp: new Date().toISOString()
    });
    session.updatedAt = new Date().toISOString();

    sessions.set(sessionId, session);
    saveSession(session);

    Logger.warn(`[Session Service] Recorded error for session ${sessionId}: ${error.message || error}`);
    return session;
}

/**
 * Delete a session
 * 
 * @param {string} sessionId - Session ID
 * @returns {boolean} True if deleted
 */
function deleteSession(sessionId) {
    const session = getSession(sessionId);
    if (!session) return false;

    // Delete from memory
    sessions.delete(sessionId);

    // Delete file
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    Logger.info(`[Session Service] Deleted session: ${sessionId}`);
    return true;
}

/**
 * List all sessions
 * 
 * @param {object} options - List options
 * @param {number} options.limit - Max sessions to return
 * @param {number} options.offset - Offset for pagination
 * @param {string} options.state - Filter by state
 * @param {string} options.sort - Sort order: 'asc' or 'desc'
 * @returns {object} Sessions list with pagination
 */
function listSessions(options = {}) {
    const { limit = 50, offset = 0, state, sort = 'desc' } = options;

    // Load all sessions from files
    loadAllSessions();

    // Convert to array and filter
    let sessionList = Array.from(sessions.values());

    if (state) {
        sessionList = sessionList.filter(s => s.state === state);
    }

    // Sort by creation date
    sessionList.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return sort === 'asc' ? dateA - dateB : dateB - dateA;
    });

    // Paginate
    const total = sessionList.length;
    const paginatedSessions = sessionList.slice(offset, offset + limit);

    return {
        sessions: paginatedSessions,
        pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
        }
    };
}

/**
 * Get session statistics
 * 
 * @returns {object} Aggregate statistics
 */
function getStatistics() {
    loadAllSessions();

    const allSessions = Array.from(sessions.values());

    const stats = {
        total: allSessions.length,
        byState: {},
        averageDuration: 0,
        totalEvents: 0,
        totalVideoSize: 0,
        totalAudioSize: 0
    };

    // Count by state
    for (const state of Object.values(SessionState)) {
        stats.byState[state] = allSessions.filter(s => s.state === state).length;
    }

    // Aggregate stats
    let totalDuration = 0;
    for (const session of allSessions) {
        totalDuration += session.stats.duration || 0;
        stats.totalEvents += session.stats.eventCount || 0;
        stats.totalVideoSize += session.stats.videoSize || 0;
        stats.totalAudioSize += session.stats.audioSize || 0;
    }

    stats.averageDuration = allSessions.length > 0 ? totalDuration / allSessions.length : 0;

    return stats;
}

/**
 * Clean up old sessions
 * 
 * @param {number} maxAgeMs - Max age in milliseconds (default: 7 days)
 * @returns {number} Number of deleted sessions
 */
function cleanupOldSessions(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    loadAllSessions();

    const now = Date.now();
    let deleted = 0;

    for (const [sessionId, session] of sessions.entries()) {
        const createdAt = new Date(session.createdAt).getTime();
        const age = now - createdAt;

        if (age > maxAgeMs && session.state !== SessionState.PROCESSING) {
            deleteSession(sessionId);
            deleted++;
        }
    }

    Logger.info(`[Session Service] Cleaned up ${deleted} old sessions`);
    return deleted;
}

/**
 * Save session to file
 */
function saveSession(session) {
    try {
        const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
    } catch (error) {
        Logger.error(`[Session Service] Error saving session ${session.id}:`, error);
    }
}

/**
 * Load all sessions from files
 */
function loadAllSessions() {
    try {
        if (!fs.existsSync(SESSIONS_DIR)) return;

        const files = fs.readdirSync(SESSIONS_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const sessionId = file.replace('.json', '');
            if (!sessions.has(sessionId)) {
                const filePath = path.join(SESSIONS_DIR, file);
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    sessions.set(sessionId, data);
                } catch (error) {
                    Logger.error(`[Session Service] Error loading ${file}:`, error);
                }
            }
        }
    } catch (error) {
        Logger.error('[Session Service] Error loading sessions:', error);
    }
}

module.exports = {
    SessionState,
    generateSessionId,
    createSession,
    getSession,
    updateSession,
    updateState,
    addEvents,
    recordError,
    deleteSession,
    listSessions,
    getStatistics,
    cleanupOldSessions
};
