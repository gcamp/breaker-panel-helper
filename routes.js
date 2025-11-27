const express = require('express');
const router = express.Router();
const ErrorHandler = require('./services/error-handler');
const CrudHelpers = require('./crud-helpers');

// Import validation middleware
const {
    validateId,
    validatePanelData,
    validateBreakerData,
    validateRoomData,
    validateCircuitData
} = require('./middleware');

// Database service will be injected
let databaseService;

const setDatabaseService = (service) => {
    databaseService = service;
    CrudHelpers.setDatabaseService(service);
};

// Panel routes
router.get('/panels', ErrorHandler.asyncHandler(async (req, res) => {
    const panels = await databaseService.all('SELECT * FROM panels ORDER BY created_at DESC');
    res.json(panels);
}));

router.get('/panels/:id', validateId(), CrudHelpers.createGetByIdHandler('panels', 'Panel'));

router.post('/panels', validatePanelData, CrudHelpers.createCreateHandler(
    'panels',
    ['name', 'size'],
    CrudHelpers.createTextTrimmer(['name'])
));

router.put('/panels/:id', validateId(), validatePanelData, CrudHelpers.createUpdateHandler(
    'panels',
    'Panel',
    ['name', 'size'],
    CrudHelpers.createTextTrimmer(['name'])
));

router.delete('/panels/:id', validateId(), CrudHelpers.createDeleteHandler('panels', 'Panel'));

// Get panel with all breakers and circuits in one request
router.get('/panels/:panelId/complete', validateId('panelId'), ErrorHandler.asyncHandler(async (req, res) => {
    const panelId = req.params.panelId;
    
    // Get panel info
    const panel = await databaseService.get('SELECT * FROM panels WHERE id = ?', [panelId]);
    if (!panel) {
        return res.status(404).json({ error: 'Panel not found' });
    }
    
    // Get all breakers for this panel
    const breakers = await databaseService.all('SELECT * FROM breakers WHERE panel_id = ? ORDER BY position', [panelId]);
    
    // Get all circuits for breakers in this panel
    const circuits = await databaseService.all(`
        SELECT c.*, b.position, b.slot_position, r.name as room, r.level as room_level
        FROM circuits c 
        JOIN breakers b ON c.breaker_id = b.id 
        LEFT JOIN rooms r ON c.room_id = r.id
        WHERE b.panel_id = ? 
        ORDER BY b.position, c.id
    `, [panelId]);
    
    res.json({
        panel,
        breakers,
        circuits
    });
}));

// Breaker routes
router.get('/panels/:panelId/breakers', validateId('panelId'), ErrorHandler.asyncHandler(async (req, res) => {
    const breakers = await databaseService.all('SELECT * FROM breakers WHERE panel_id = ? ORDER BY position', [req.params.panelId]);
    res.json(breakers);
}));

router.get('/breakers/:id', validateId(), CrudHelpers.createGetByIdHandler('breakers', 'Breaker'));

router.get('/panels/:panelId/breakers/position/:position', 
    CrudHelpers.validateNumericParam('panelId'),
    CrudHelpers.validateNumericParam('position'),
    ErrorHandler.asyncHandler(async (req, res) => {
    const panelId = req.params.panelId;
    const position = req.params.position;
    const slotPosition = req.query.slot_position || 'single';

    // For tandem breakers, we might need to get both A and B breakers
    if (slotPosition === 'both') {
        const breakers = await databaseService.all('SELECT * FROM breakers WHERE panel_id = ? AND position = ? ORDER BY slot_position', [panelId, position]);
        res.json(breakers || []);
    } else {
        const breaker = await databaseService.get('SELECT * FROM breakers WHERE panel_id = ? AND position = ? AND slot_position = ?', [panelId, position, slotPosition]);
        res.json(breaker || null);
    }
}));

router.post('/breakers', validateBreakerData, ErrorHandler.asyncHandler(async (req, res) => {
    const breakerData = ErrorHandler.processBreakerData(req.body, 'create');

    try {
        const result = await databaseService.run(
            `INSERT INTO breakers (panel_id, position, label, amperage, critical, monitor, confirmed, breaker_type, slot_position) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [breakerData.panel_id, breakerData.position, breakerData.label, breakerData.amperage, 
             breakerData.critical, breakerData.monitor, breakerData.confirmed, breakerData.breaker_type,
             breakerData.slot_position]
        );
        
        res.status(201).json({ id: result.id, ...breakerData });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error, { field: 'panel_id' });
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.put('/breakers/:id', validateId(), validateBreakerData, ErrorHandler.asyncHandler(async (req, res) => {
    const breakerData = ErrorHandler.processBreakerData(req.body, 'update');

    try {
        const result = await databaseService.run(
            `UPDATE breakers SET label = ?, amperage = ?, critical = ?, monitor = ?, confirmed = ?, breaker_type = ?, slot_position = ? WHERE id = ?`,
            [breakerData.label, breakerData.amperage, breakerData.critical, breakerData.monitor, 
             breakerData.confirmed, breakerData.breaker_type, breakerData.slot_position, req.params.id]
        );

        if (result.changes === 0) {
            const errorInfo = ErrorHandler.handleNotFoundError('Breaker');
            return ErrorHandler.sendError(res, errorInfo);
        }
        res.json({ id: req.params.id, ...breakerData });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error);
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.delete('/breakers/:id', validateId(), CrudHelpers.createDeleteHandler('breakers', 'Breaker'));

// Move breaker endpoint
router.post('/breakers/move', ErrorHandler.asyncHandler(async (req, res) => {
    const {
        sourceBreakerId,
        destinationPanelId,
        destinationPosition,
        destinationSlot
    } = req.body;

    // Validate required fields
    if (!sourceBreakerId || !destinationPanelId || !destinationPosition) {
        return CrudHelpers.handleValidationError(res, 'Missing required fields');
    }

    try {
        // Check source breaker exists first (outside transaction)
        const sourceBreaker = await databaseService.get('SELECT * FROM breakers WHERE id = ?', [sourceBreakerId]);
        if (!sourceBreaker) {
            const errorInfo = ErrorHandler.handleNotFoundError('Source breaker');
            return ErrorHandler.sendError(res, errorInfo);
        }

        await databaseService.transaction(async (db) => {
            const sourceCircuits = await db.all(
                'SELECT * FROM circuits WHERE breaker_id = ?', 
                [sourceBreakerId]
            );

            // Check if destination position is occupied
            let destinationBreaker = await db.get(
                'SELECT * FROM breakers WHERE panel_id = ? AND position = ? AND slot_position = ?', 
                [destinationPanelId, destinationPosition, destinationSlot || 'single']
            );

            let destinationCircuits = [];
            if (destinationBreaker) {
                destinationCircuits = await db.all(
                    'SELECT * FROM circuits WHERE breaker_id = ?', 
                    [destinationBreaker.id]
                );
            }

            if (destinationBreaker) {
                // Swap circuits between existing breakers
                for (const circuit of sourceCircuits) {
                    await db.run(
                        'UPDATE circuits SET breaker_id = ? WHERE id = ?',
                        [destinationBreaker.id, circuit.id]
                    );
                }
                
                for (const circuit of destinationCircuits) {
                    await db.run(
                        'UPDATE circuits SET breaker_id = ? WHERE id = ?',
                        [sourceBreakerId, circuit.id]
                    );
                }
            } else {
                // Create new breaker at destination and move circuits there
                const newBreaker = await db.run(
                    `INSERT INTO breakers (panel_id, position, slot_position, label, amperage, critical, monitor, confirmed, breaker_type) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        destinationPanelId,
                        destinationPosition,
                        destinationSlot || 'single',
                        '', // Empty label - will be auto-generated from circuits
                        sourceBreaker.amperage,
                        sourceBreaker.critical,
                        sourceBreaker.monitor,
                        sourceBreaker.confirmed,
                        sourceBreaker.breaker_type
                    ]
                );
                
                // Move circuits to new breaker
                for (const circuit of sourceCircuits) {
                    await db.run(
                        'UPDATE circuits SET breaker_id = ? WHERE id = ?',
                        [newBreaker.id, circuit.id]
                    );
                }
            }

            // Check if source breaker still has circuits after the move
            const remainingCircuits = await db.all(
                'SELECT * FROM circuits WHERE breaker_id = ?', 
                [sourceBreakerId]
            );

            if (remainingCircuits.length === 0) {
                // Delete empty source breaker
                await db.run('DELETE FROM breakers WHERE id = ?', [sourceBreakerId]);
            }
        });

        res.json({ 
            message: 'Breaker moved successfully'
        });

    } catch (error) {
        console.error('Move breaker error:', error);
        const errorInfo = ErrorHandler.handleDatabaseError(error, { operation: 'move' });
        ErrorHandler.sendError(res, errorInfo);
    }
}));

// Room routes
router.get('/rooms', ErrorHandler.asyncHandler(async (req, res) => {
    const rooms = await databaseService.all(`
        SELECT * FROM rooms 
        ORDER BY 
            CASE level 
                WHEN 'upper' THEN 1 
                WHEN 'main' THEN 2 
                WHEN 'basement' THEN 3 
                WHEN 'outside' THEN 4 
            END, 
            name
    `);
    res.json(rooms);
}));

router.post('/rooms', validateRoomData, CrudHelpers.createCreateHandler(
    'rooms',
    ['name', 'level'],
    CrudHelpers.createTextTrimmer(['name'])
));

router.put('/rooms/:id', validateId(), validateRoomData, CrudHelpers.createUpdateHandler(
    'rooms',
    'Room',
    ['name', 'level'],
    CrudHelpers.createTextTrimmer(['name'])
));

router.delete('/rooms/:id', validateId(), CrudHelpers.createDeleteHandler('rooms', 'Room'));

// Circuit routes
router.get('/circuits', ErrorHandler.asyncHandler(async (req, res) => {
    const circuits = await databaseService.all(`
        SELECT c.*, r.name as room_name, r.level as room_level 
        FROM circuits c 
        LEFT JOIN rooms r ON c.room_id = r.id 
        ORDER BY c.created_at
    `);
    res.json(circuits);
}));

router.get('/breakers/:breakerId/circuits', validateId('breakerId'), ErrorHandler.asyncHandler(async (req, res) => {
    const circuits = await databaseService.all(`
        SELECT c.*, r.name as room_name, r.level as room_level 
        FROM circuits c 
        LEFT JOIN rooms r ON c.room_id = r.id 
        WHERE c.breaker_id = ? 
        ORDER BY c.created_at
    `, [req.params.breakerId]);
    res.json(circuits);
}));

router.post('/circuits', validateCircuitData, ErrorHandler.asyncHandler(async (req, res) => {
    const circuitData = ErrorHandler.processCircuitData(req.body, 'create');

    try {
        const result = await databaseService.run(
            `INSERT INTO circuits (breaker_id, room_id, type, notes, subpanel_id) VALUES (?, ?, ?, ?, ?)`,
            [circuitData.breaker_id, circuitData.room_id, circuitData.type, circuitData.notes, circuitData.subpanel_id]
        );

        res.status(201).json({ id: result.id, ...circuitData });
    } catch (error) {
        const errorInfo = ErrorHandler.handleDatabaseError(error, { field: 'breaker_id' });
        ErrorHandler.sendError(res, errorInfo);
    }
}));

router.put('/circuits/:id', validateId(), validateCircuitData, ErrorHandler.asyncHandler(async (req, res) => {
    const circuitData = ErrorHandler.processCircuitData(req.body, 'update');

    const result = await databaseService.run(
        `UPDATE circuits SET room_id = ?, type = ?, notes = ?, subpanel_id = ? WHERE id = ?`,
        [circuitData.room_id, circuitData.type, circuitData.notes, circuitData.subpanel_id, req.params.id]
    );

    if (result.changes === 0) {
        const errorInfo = ErrorHandler.handleNotFoundError('Circuit');
        return ErrorHandler.sendError(res, errorInfo);
    }
    res.json({ id: req.params.id, ...circuitData });
}));

router.delete('/circuits/:id', validateId(), CrudHelpers.createDeleteHandler('circuits', 'Circuit'));


module.exports = { router, setDatabaseService };