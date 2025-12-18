/**
 * Request Validation Middleware
 * Schema-based validation for request bodies, query params, and URL params.
 * 
 * Features:
 * - JSON Schema validation (simplified, no external deps)
 * - Validates body, query, and params
 * - Standardized error responses
 * - Reusable validation schemas
 */

const { Logger } = require('../config');

/**
 * Validation error class
 */
class ValidationError extends Error {
    constructor(message, errors = []) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
        this.statusCode = 400;
    }
}

/**
 * Type validators
 */
const typeValidators = {
    string: (value) => typeof value === 'string',
    number: (value) => typeof value === 'number' && !isNaN(value),
    integer: (value) => Number.isInteger(value),
    boolean: (value) => typeof value === 'boolean',
    array: (value) => Array.isArray(value),
    object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
    null: (value) => value === null
};

/**
 * Validate a value against a schema
 * 
 * @param {any} value - Value to validate
 * @param {object} schema - Validation schema
 * @param {string} path - Current property path
 * @returns {string[]} Array of error messages
 */
function validateValue(value, schema, path = '') {
    const errors = [];

    // Check required
    if (value === undefined || value === null) {
        if (schema.required) {
            errors.push(`${path || 'value'} is required`);
        }
        return errors;
    }

    // Check type
    if (schema.type) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        const isValidType = types.some(type => typeValidators[type]?.(value));
        if (!isValidType) {
            errors.push(`${path || 'value'} must be of type ${types.join(' or ')}`);
            return errors; // Stop further validation if type is wrong
        }
    }

    // String validations
    if (typeof value === 'string') {
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            errors.push(`${path || 'value'} must be at least ${schema.minLength} characters`);
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            errors.push(`${path || 'value'} must be at most ${schema.maxLength} characters`);
        }
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
            errors.push(`${path || 'value'} does not match required pattern`);
        }
        if (schema.enum && !schema.enum.includes(value)) {
            errors.push(`${path || 'value'} must be one of: ${schema.enum.join(', ')}`);
        }
        if (schema.format) {
            const formatErrors = validateFormat(value, schema.format, path);
            errors.push(...formatErrors);
        }
    }

    // Number validations
    if (typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`${path || 'value'} must be at least ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`${path || 'value'} must be at most ${schema.maximum}`);
        }
        if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
            errors.push(`${path || 'value'} must be greater than ${schema.exclusiveMinimum}`);
        }
        if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
            errors.push(`${path || 'value'} must be less than ${schema.exclusiveMaximum}`);
        }
    }

    // Array validations
    if (Array.isArray(value)) {
        if (schema.minItems !== undefined && value.length < schema.minItems) {
            errors.push(`${path || 'value'} must have at least ${schema.minItems} items`);
        }
        if (schema.maxItems !== undefined && value.length > schema.maxItems) {
            errors.push(`${path || 'value'} must have at most ${schema.maxItems} items`);
        }
        if (schema.items) {
            value.forEach((item, index) => {
                const itemErrors = validateValue(item, schema.items, `${path}[${index}]`);
                errors.push(...itemErrors);
            });
        }
    }

    // Object validations
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                const propPath = path ? `${path}.${propName}` : propName;
                const propErrors = validateValue(value[propName], propSchema, propPath);
                errors.push(...propErrors);
            }
        }

        // Check for required properties
        if (schema.required && Array.isArray(schema.required)) {
            for (const requiredProp of schema.required) {
                if (value[requiredProp] === undefined) {
                    const propPath = path ? `${path}.${requiredProp}` : requiredProp;
                    errors.push(`${propPath} is required`);
                }
            }
        }

        // Check for additional properties
        if (schema.additionalProperties === false && schema.properties) {
            const allowedProps = Object.keys(schema.properties);
            const extraProps = Object.keys(value).filter(p => !allowedProps.includes(p));
            if (extraProps.length > 0) {
                errors.push(`${path ? path + ': ' : ''}Unknown properties: ${extraProps.join(', ')}`);
            }
        }
    }

    // Custom validator
    if (schema.validate && typeof schema.validate === 'function') {
        const customError = schema.validate(value);
        if (customError) {
            errors.push(`${path || 'value'}: ${customError}`);
        }
    }

    return errors;
}

/**
 * Validate string formats
 */
function validateFormat(value, format, path) {
    const errors = [];
    const formats = {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        url: /^https?:\/\/.+/,
        uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'date-time': /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/,
        date: /^\d{4}-\d{2}-\d{2}$/,
        sessionId: /^session_\d+_\w+$/
    };

    if (formats[format] && !formats[format].test(value)) {
        errors.push(`${path || 'value'} must be a valid ${format}`);
    }

    return errors;
}

/**
 * Create validation middleware
 * 
 * @param {object} schemas - Validation schemas for body, query, params
 * @param {object} schemas.body - Schema for request body
 * @param {object} schemas.query - Schema for query parameters
 * @param {object} schemas.params - Schema for URL parameters
 * @returns {function} Express middleware
 */
function validate(schemas = {}) {
    return (req, res, next) => {
        const errors = [];

        try {
            // Validate body
            if (schemas.body && req.body) {
                const bodyErrors = validateValue(req.body, schemas.body, '');
                errors.push(...bodyErrors.map(e => ({ location: 'body', message: e })));
            }

            // Validate query
            if (schemas.query && req.query) {
                // Coerce query string values
                const coercedQuery = coerceQueryTypes(req.query, schemas.query);
                req.query = coercedQuery;

                const queryErrors = validateValue(coercedQuery, schemas.query, '');
                errors.push(...queryErrors.map(e => ({ location: 'query', message: e })));
            }

            // Validate params
            if (schemas.params && req.params) {
                const paramErrors = validateValue(req.params, schemas.params, '');
                errors.push(...paramErrors.map(e => ({ location: 'params', message: e })));
            }

            if (errors.length > 0) {
                Logger.warn(`[Validator] Validation failed: ${errors.length} errors`);
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Request validation failed',
                        errors: errors
                    }
                });
            }

            next();
        } catch (error) {
            Logger.error('[Validator] Error during validation:', error);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'An error occurred during validation'
                }
            });
        }
    };
}

/**
 * Coerce query string values to their expected types
 */
function coerceQueryTypes(query, schema) {
    if (!schema.properties) return query;

    const coerced = { ...query };

    for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (coerced[key] === undefined) continue;

        const value = coerced[key];
        const type = propSchema.type;

        if (type === 'number' || type === 'integer') {
            const num = Number(value);
            if (!isNaN(num)) {
                coerced[key] = num;
            }
        } else if (type === 'boolean') {
            if (value === 'true') coerced[key] = true;
            else if (value === 'false') coerced[key] = false;
        } else if (type === 'array' && typeof value === 'string') {
            coerced[key] = value.split(',');
        }
    }

    return coerced;
}

/**
 * Pre-built schemas for common use cases
 */
const schemas = {
    // Session ID parameter
    sessionId: {
        params: {
            properties: {
                sessionId: {
                    type: 'string',
                    required: true,
                    format: 'sessionId'
                }
            },
            required: ['sessionId']
        }
    },

    // Pagination query
    pagination: {
        query: {
            properties: {
                page: { type: 'integer', minimum: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 100 },
                sort: { type: 'string', enum: ['asc', 'desc'] }
            }
        }
    },

    // Recording process request
    processRecording: {
        body: {
            type: 'object',
            properties: {
                sessionId: { type: 'string', required: true },
                events: { type: 'array' },
                metadata: { type: 'object' }
            },
            required: ['sessionId']
        }
    },

    // Chat message request
    chatMessage: {
        body: {
            type: 'object',
            properties: {
                text: { type: 'string', required: true, minLength: 1, maxLength: 10000 },
                sessionId: { type: 'string', required: true },
                events: { type: 'array' },
                metadata: { type: 'object' }
            },
            required: ['text', 'sessionId']
        }
    },

    // Batch processing request
    batchProcess: {
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
                options: { type: 'object' }
            },
            required: ['sessions']
        }
    }
};

/**
 * Create validation middleware from a preset schema
 * 
 * @param {string} schemaName - Name of the preset schema
 * @returns {function} Express middleware
 */
function useSchema(schemaName) {
    const schema = schemas[schemaName];
    if (!schema) {
        throw new Error(`Unknown validation schema: ${schemaName}`);
    }
    return validate(schema);
}

module.exports = {
    validate,
    validateValue,
    useSchema,
    schemas,
    ValidationError
};
