/**
 * Error Handler - Centralized error handling utilities
 */

class ErrorHandler {
    /**
     * Handle database constraint errors with user-friendly messages
     * @param {Error} error - Database error
     * @param {Object} context - Context information for error handling
     * @returns {Object} Formatted error response
     */
    static handleDatabaseError(error, context = {}) {
        console.error('Database error:', error);

        // Handle UNIQUE constraint violations
        if (error.message.includes('UNIQUE constraint failed')) {
            if (error.message.includes('panels.name')) {
                return {
                    status: 409,
                    message: 'A panel with this name already exists'
                };
            }
            if (error.message.includes('rooms.name')) {
                return {
                    status: 409,
                    message: 'A room with this name already exists'
                };
            }
            if (error.message.includes('breakers')) {
                return {
                    status: 409,
                    message: 'A breaker already exists at this position and slot'
                };
            }
            return {
                status: 409,
                message: 'A record with this information already exists'
            };
        }

        // Handle FOREIGN KEY constraint violations
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            // Special handling for move operations
            if (context.operation === 'move') {
                return {
                    status: 400,
                    message: 'Invalid panel or breaker reference'
                };
            }
            
            if (error.message.includes('panel_id') || context.field === 'panel_id') {
                return {
                    status: 400,
                    message: 'Invalid panel_id - panel does not exist'
                };
            }
            if (error.message.includes('breaker_id') || context.field === 'breaker_id') {
                return {
                    status: 400,
                    message: 'Invalid breaker_id - breaker does not exist'
                };
            }
            if (error.message.includes('room_id') || context.field === 'room_id') {
                return {
                    status: 400,
                    message: 'Invalid room_id - room does not exist'
                };
            }
            if (error.message.includes('subpanel_id') || context.field === 'subpanel_id') {
                return {
                    status: 400,
                    message: 'Invalid subpanel_id - subpanel does not exist'
                };
            }
            return {
                status: 400,
                message: 'Foreign key constraint violation'
            };
        }

        // Handle SQLite constraint errors for move operations
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return {
                status: 409,
                message: context.operation === 'move' ? 'Destination position is already occupied' : 'Record already exists'
            };
        }

        if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || error.code === 'SQLITE_CONSTRAINT') {
            return {
                status: 400,
                message: context.operation === 'move' ? 'Invalid panel or breaker reference' : 'Invalid reference'
            };
        }

        // Default database error
        return {
            status: 500,
            message: process.env.NODE_ENV === 'production' ? 'Database operation failed' : error.message
        };
    }

    /**
     * Handle validation errors
     * @param {string} message - Validation error message
     * @returns {Object} Formatted error response
     */
    static handleValidationError(message) {
        return {
            status: 400,
            message: message
        };
    }

    /**
     * Handle not found errors
     * @param {string} resourceType - Type of resource not found
     * @returns {Object} Formatted error response
     */
    static handleNotFoundError(resourceType = 'Resource') {
        return {
            status: 404,
            message: `${resourceType} not found`
        };
    }

    /**
     * Handle general server errors
     * @param {Error} error - Server error
     * @param {string} operation - Description of the operation that failed
     * @returns {Object} Formatted error response
     */
    static handleServerError(error, operation = 'Operation') {
        console.error(`Server error during ${operation}:`, error);
        
        return {
            status: 500,
            message: process.env.NODE_ENV === 'production' 
                ? `${operation} failed` 
                : `${operation} failed: ${error.message}`
        };
    }

    /**
     * Send formatted error response
     * @param {Object} res - Express response object
     * @param {Object} errorInfo - Error information from handler methods
     */
    static sendError(res, errorInfo) {
        res.status(errorInfo.status).json({ error: errorInfo.message });
    }

    /**
     * Express middleware for handling async errors
     * @param {Function} fn - Async route handler
     * @returns {Function} Express middleware function
     */
    static asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    /**
     * Process breaker data with standardized error handling
     * @param {Object} breakerData - Raw breaker data
     * @param {string} operation - Operation type ('create' or 'update')
     * @returns {Object} Processed breaker data
     */
    static processBreakerData(breakerData, operation = 'create') {
        const {
            panel_id,
            position,
            label,
            amperage,
            monitor,
            confirmed,
            breaker_type,
            slot_position
        } = breakerData;

        // For tandem breakers, ensure slot_position is set appropriately
        let finalSlotPosition = slot_position || 'single';
        let finalBreakerType = breaker_type || 'single';

        if (finalBreakerType === 'tandem' && finalSlotPosition === 'single') {
            finalSlotPosition = 'A';
        }

        const processedData = {
            label: label?.trim() || null,
            amperage: amperage || null,
            monitor: Boolean(monitor),
            confirmed: Boolean(confirmed),
            breaker_type: finalBreakerType,
            slot_position: finalSlotPosition
        };

        // Include required fields for creation
        if (operation === 'create') {
            processedData.panel_id = panel_id;
            processedData.position = position;
        }

        return processedData;
    }

    /**
     * Process circuit data with error handling
     * @param {Object} circuitData - Raw circuit data
     * @param {string} operation - Operation type ('create' or 'update')  
     * @returns {Object} Processed circuit data
     */
    static processCircuitData(circuitData, operation = 'create') {
        const { breaker_id, room_id, type, notes, subpanel_id } = circuitData;

        const processedData = {
            room_id: room_id || null,
            type: type || null,
            notes: notes?.trim() || null,
            subpanel_id: subpanel_id || null
        };

        // Include required fields for creation
        if (operation === 'create') {
            processedData.breaker_id = breaker_id;
        }

        return processedData;
    }

    /**
     * Global error handler middleware for Express
     * @param {Error} err - Error object
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next function
     */
    static globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
        console.error('Global error handler:', err);
        
        // Handle specific error types
        if (err.message && err.message.includes('constraint')) {
            const errorInfo = ErrorHandler.handleDatabaseError(err);
            return ErrorHandler.sendError(res, errorInfo);
        }

        // Default to server error
        const errorInfo = ErrorHandler.handleServerError(err, 'Request');
        ErrorHandler.sendError(res, errorInfo);
    }
}

module.exports = ErrorHandler;