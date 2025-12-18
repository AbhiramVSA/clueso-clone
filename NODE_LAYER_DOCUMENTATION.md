# Node Layer Feature Documentation

## Overview

The Clueso Node layer has been enhanced with six production-ready features designed to improve reliability, observability, and performance. This document details the implementation and usage of these features, which transform the base template into a robust backend architecture.

## Table of Contents

1. [Architecture](#architecture)
2. [Feature 1: Rate Limiting Middleware](#feature-1-rate-limiting-middleware)
3. [Feature 2: Request Validation Middleware](#feature-2-request-validation-middleware)
4. [Feature 3: Session Management Service](#feature-3-session-management-service)
5. [Feature 4: Health & Metrics Dashboard](#feature-4-health--metrics-dashboard)
6. [Feature 5: Error Handling Middleware](#feature-5-error-handling-middleware)
7. [Feature 6: Batch Processing API](#feature-6-batch-processing-api)
8. [API Reference](#api-reference)
9. [Integration Guide](#integration-guide)

---

## Architecture

```
Clueso_Node_layer/
├── src/
│   ├── middlewares/
│   │   ├── rate-limiter.js      # Traffic control
│   │   ├── validator.js         # Schema validation
│   │   └── error-handler.js     # Global error catching
│   ├── services/
│   │   ├── session-service.js   # Lifecycle tracking
│   │   ├── health-service.js    # Monitoring & metrics
│   │   └── batch-service.js     # Queue management
│   ├── routes/v1/
│   │   ├── session-routes.js    # /api/sessions
│   │   ├── health-routes.js     # /api/health
│   │   └── batch-routes.js      # /api/batch
│   └── data/sessions/           # JSON session persistence
```

---

## Feature 1: Rate Limiting Middleware

**File**: `src/middlewares/rate-limiter.js`

### Purpose
Protects the API from abuse and denial-of-service attacks while ensuring fair resource allocation across clients.

### Implementation
Uses a memory-efficient **Token Bucket** algorithm. It tracks requests per IP address and includes automatic cleanup of expired entries to prevent memory leaks.

| Preset | Window | Max Requests | Use Case |
|--------|--------|--------------|----------|
| `strict` | 1 min | 10 | Auth/Sensitive endpoints |
| `standard` | 1 min | 100 | General API usage |
| `upload` | 1 min | 20 | File upload endpoints |
| `aiProcessing` | 1 min | 5 | Expensive AI operations |

**Headers Added**:
- `X-RateLimit-Limit`: Request limit
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: UTC epoch time of reset

---

## Feature 2: Request Validation Middleware

**File**: `src/middlewares/validator.js`

### Purpose
Enforces strict schema-based validation for all incoming requests, preventing malformed data from reaching business logic.

### Implementation
Provides a simplified JSON Schema validator that checks:
- **Type Safety**: Ensures strings, numbers, and booleans match expectations.
- **Required Fields**: Mandatory property checks.
- **Format Validation**: Specific formats like `email`, `uuid`, and `sessionId`.
- **Query Coercion**: Automatically converts query string numbers (e.g., `"10"`) to integers.

---

## Feature 3: Session Management Service

**Files**: `src/services/session-service.js`, `src/routes/v1/session-routes.js`

### Purpose
Manages the end-to-end lifecycle of recording sessions, providing persistence and state tracking.

### Implementation
- **State Machine**: Tracks transitions between `created`, `recording`, `processing`, `completed`, and `failed`.
- **Persistence**: Saves session metadata as JSON in `src/data/sessions/` for durability.
- **Statistics**: Automatically aggregates session data (event counts, duration, etc.).
- **Cleanup**: Built-in logic to prune sessions older than 7 days.

---

## Feature 4: Health & Metrics Dashboard

**Files**: `src/services/health-service.js`, `src/routes/v1/health-routes.js`

### Purpose
Provides real-time visibility into system health, performance metrics, and dependency status.

### Implementation
- **System Metrics**: Monitors CPU load, memory usage, and OS details.
- **Request Metrics**: Tracks request counts, error rates, and response time percentiles (P95).
- **Dependency Probes**: Actively checks connectivity to ProductAI and Deepgram services.
- **Availability**: Standardized `/health/ready` and `/health/live` probes for production deployments.

---

## Feature 5: Error Handling Middleware

**File**: `src/middlewares/error-handler.js`

### Purpose
Provides a centralized, standardized mechanism for handling and responding to errors across the entire application.

### Implementation
- **Correlation IDs**: Generates a unique `X-Correlation-ID` for every request to link client errors to server logs.
- **Standardized Format**:
  ```json
  {
    "success": false,
    "error": {
      "code": "NOT_FOUND",
      "message": "Session not found",
      "correlationId": "m4j1-xyz-789"
    }
  }
  ```
- **Operational vs. Programmer Errors**: Distinguishes between expected errors (validation) and unexpected crashes.

---

## Feature 6: Batch Processing API

**Files**: `src/services/batch-service.js`, `src/routes/v1/batch-routes.js`

### Purpose
Enables bulk processing of recording sessions, allowing users to queue multiple recordings for AI analysis simultaneously.

### Implementation
- **Queue Management**: Jobs are executed asynchronously in the background.
- **Progress Tracking**: Real-time progress updates (percentage, completed count, error count).
- **Retry Logic**: Implements **Exponential Backoff** (up to 3 retries) for individual items in a batch.
- **Event-Driven**: Emits events that can be hooked into Socket.IO for real-time frontend updates.

---

## API Reference

### Sessions (`/api/v1/sessions`)
- `GET /`: List sessions with pagination.
- `POST /`: Initialize a new session.
- `GET /stats`: Get aggregate platform stats.
- `GET /:id`: Fetch full session details.

### Health (`/api/v1/health`)
- `GET /`: Basic heartbeat.
- `GET /detailed`: Full system and dependency status.
- `GET /metrics`: Response time and status code distribution.

### Batch (`/api/v1/batch`)
- `POST /process`: Submit an array of session IDs for processing.
- `GET /:id/progress`: Check status of a specific batch job.

---

## Integration Guide

### 1. Adding Rate Limiting to a Route
```javascript
const { usePreset } = require('../../middlewares/rate-limiter');
router.post('/process', usePreset('aiProcessing'), handler);
```

### 2. Validating Requests
```javascript
const { validate, schemas } = require('../../middlewares/validator');
router.post('/events', validate(schemas.processRecording), handler);
```

### 3. Handling Async Errors
```javascript
const { asyncHandler, createError } = require('../../middlewares/error-handler');
router.get('/:id', asyncHandler(async (req, res) => {
    const data = await service.get(req.params.id);
    if (!data) throw createError.notFound('Item missing');
    res.json(data);
}));
```
