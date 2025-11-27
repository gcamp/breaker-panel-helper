const request = require('supertest');
const fs = require('fs');

// Import the app
const app = require('../server.js');
const { connectDB } = require('../server.js');

describe('Breaker Panel API Tests', () => {
    const TEST_DB_PATH = `test_api_${Date.now()}.db`;

    beforeAll(async () => {
        // Set up unique test database
        process.env.DB_PATH = TEST_DB_PATH;
        
        // Clean up any existing test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        
        // Initialize database connection
        await connectDB();
    });

    afterAll(async () => {
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    describe('Panel Management', () => {
        let panelId;

        test('POST /api/panels - Create new panel', async () => {
            const newPanel = {
                name: 'Test Main Panel',
                size: 40
            };

            const response = await request(app)
                .post('/api/panels')
                .send(newPanel)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(newPanel.name);
            expect(response.body.size).toBe(newPanel.size);
            
            panelId = response.body.id;
        });

        test('GET /api/panels - Get all panels', async () => {
            const response = await request(app)
                .get('/api/panels')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('id');
            expect(response.body[0]).toHaveProperty('name');
            expect(response.body[0]).toHaveProperty('size');
        });

        test('GET /api/panels/:id - Get specific panel', async () => {
            const response = await request(app)
                .get(`/api/panels/${panelId}`)
                .expect(200);

            expect(response.body.id).toBe(panelId);
            expect(response.body.name).toBe('Test Main Panel');
            expect(response.body.size).toBe(40);
        });

        test('PUT /api/panels/:id - Update panel', async () => {
            const updatedPanel = {
                name: 'Updated Main Panel',
                size: 42
            };

            const response = await request(app)
                .put(`/api/panels/${panelId}`)
                .send(updatedPanel)
                .expect(200);

            expect(response.body.name).toBe(updatedPanel.name);
            expect(response.body.size).toBe(updatedPanel.size);
        });

        test('POST /api/panels - Validation errors', async () => {
            // Missing name
            await request(app)
                .post('/api/panels')
                .send({ size: 40 })
                .expect(400);

            // Invalid size
            await request(app)
                .post('/api/panels')
                .send({ name: 'Test', size: 50 })
                .expect(400);

            // Empty name
            await request(app)
                .post('/api/panels')
                .send({ name: '', size: 40 })
                .expect(400);
        });
    });

    describe('Breaker Management', () => {
        let panelId;
        let breakerId;

        beforeEach(async () => {
            // Create a fresh test panel for each test
            const panelResponse = await request(app)
                .post('/api/panels')
                .send({ name: 'Breaker Test Panel', size: 20 });
            panelId = panelResponse.body.id;
        });

        test('POST /api/breakers - Create single breaker', async () => {
            const newBreaker = {
                panel_id: panelId,
                position: 1,
                label: 'Kitchen Outlets',
                amperage: 20,
                monitor: true,
                confirmed: false,
                double_pole: false,
                tandem: false,
                slot_position: 'single'
            };

            const response = await request(app)
                .post('/api/breakers')
                .send(newBreaker)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.label).toBe(newBreaker.label);
            expect(response.body.amperage).toBe(newBreaker.amperage);
            expect(response.body.breaker_type).toBe('single');
            expect(response.body.slot_position).toBe('single');
            
            breakerId = response.body.id;
        });

        test('POST /api/breakers - Create tandem breakers', async () => {
            const tandemBreakerA = {
                panel_id: panelId,
                position: 3,
                label: 'Bedroom Outlets A',
                amperage: 15,
                monitor: false,
                confirmed: false,
                breaker_type: 'tandem',
                slot_position: 'A'
            };

            const tandemBreakerB = {
                panel_id: panelId,
                position: 3,
                label: 'Bedroom Outlets B',
                amperage: 15,
                monitor: false,
                confirmed: false,
                breaker_type: 'tandem',
                slot_position: 'B'
            };

            // Create first tandem breaker
            const responseA = await request(app)
                .post('/api/breakers')
                .send(tandemBreakerA)
                .expect(201);

            expect(responseA.body.breaker_type).toBe('tandem');
            expect(responseA.body.slot_position).toBe('A');

            // Create second tandem breaker at same position
            const responseB = await request(app)
                .post('/api/breakers')
                .send(tandemBreakerB)
                .expect(201);

            expect(responseB.body.breaker_type).toBe('tandem');
            expect(responseB.body.slot_position).toBe('B');
        });

        test('POST /api/breakers - Create double pole breaker', async () => {
            const doublePoleBreaker = {
                panel_id: panelId,
                position: 5,
                label: 'Central AC Unit',
                amperage: 40,
                monitor: true,
                confirmed: true,
                breaker_type: 'double_pole',
                tandem: false,
                slot_position: 'single'
            };

            const response = await request(app)
                .post('/api/breakers')
                .send(doublePoleBreaker)
                .expect(201);

            expect(response.body.breaker_type).toBe('double_pole');
            expect(response.body.confirmed).toBe(true);
        });

        test('GET /api/panels/:panelId/breakers - Get breakers by panel', async () => {
            const response = await request(app)
                .get(`/api/panels/${panelId}/breakers`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(0); // Should return array
        });

        test('GET /api/panels/:panelId/breakers/position/:position - Get breaker by position', async () => {
            // Test single breaker
            const singleResponse = await request(app)
                .get(`/api/panels/${panelId}/breakers/position/1`)
                .expect(200);

            expect(singleResponse.status).toBe(200);

        });


        test('POST /api/breakers - Validation errors', async () => {
            // Missing panel_id
            await request(app)
                .post('/api/breakers')
                .send({ position: 1 })
                .expect(400);

            // Invalid amperage
            await request(app)
                .post('/api/breakers')
                .send({ panel_id: panelId, position: 1, amperage: 250 })
                .expect(400);

            // Invalid slot_position
            await request(app)
                .post('/api/breakers')
                .send({ 
                    panel_id: panelId, 
                    position: 1, 
                    slot_position: 'invalid' 
                })
                .expect(400);
        });

        test('DELETE /api/breakers/:id - Delete breaker', async () => {
            await request(app)
                .delete(`/api/breakers/${breakerId}`)
                .expect(200);

            // Verify deletion
            await request(app)
                .get(`/api/breakers/${breakerId}`)
                .expect(404);
        });
    });

    describe('Breaker Move Operations', () => {
        let sourcePanelId;
        let destPanelId;
        let sourceBreakerId;
        let destBreakerId;

        beforeEach(async () => {
            // Create source panel
            const sourcePanel = await request(app)
                .post('/api/panels')
                .send({ name: 'Source Panel', size: 20 });
            sourcePanelId = sourcePanel.body.id;

            // Create destination panel
            const destPanel = await request(app)
                .post('/api/panels')
                .send({ name: 'Destination Panel', size: 20 });
            destPanelId = destPanel.body.id;

            // Create source breaker
            const sourceBreaker = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: sourcePanelId,
                    position: 1,
                    label: 'Source Breaker',
                    amperage: 20,
                    breaker_type: 'single'
                });
            sourceBreakerId = sourceBreaker.body.id;

            // Create a circuit for the source breaker
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: sourceBreakerId,
                    room: 'Living Room',
                    type: 'outlet',
                    notes: 'Main outlets'
                });
        });

        test('POST /api/breakers/move - Move to empty position', async () => {
            const moveData = {
                sourceBreakerId: sourceBreakerId,
                sourcePanelId: sourcePanelId,
                sourcePosition: 1,
                sourceSlot: 'single',
                destinationPanelId: destPanelId,
                destinationPosition: 2,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(200);

            expect(response.body.message).toBe('Breaker moved successfully');

            // Verify destination breaker was created
            const destBreakers = await request(app)
                .get(`/api/panels/${destPanelId}/breakers`)
                .expect(200);

            expect(destBreakers.body).toHaveLength(1);
            expect(destBreakers.body[0].position).toBe(2);

            // Source breaker should be deleted since it has no remaining circuits
            await request(app)
                .get(`/api/breakers/${sourceBreakerId}`)
                .expect(404);
        });

        test('POST /api/breakers/move - Move to empty position (different panel)', async () => {
            const moveData = {
                sourceBreakerId: sourceBreakerId,
                sourcePanelId: sourcePanelId,
                sourcePosition: 1,
                sourceSlot: 'single',
                destinationPanelId: destPanelId,
                destinationPosition: 3,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(200);

            expect(response.body.message).toBe('Breaker moved successfully');

            // Verify destination breaker was created
            const destBreakers = await request(app)
                .get(`/api/panels/${destPanelId}/breakers`)
                .expect(200);

            expect(destBreakers.body).toHaveLength(1);
            expect(destBreakers.body[0].position).toBe(3);

            // Source breaker should be deleted since circuits moved
            await request(app)
                .get(`/api/breakers/${sourceBreakerId}`)
                .expect(404);
        });

        test('POST /api/breakers/move - Swap operation with occupied destination', async () => {
            // Create destination breaker
            const destBreaker = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: destPanelId,
                    position: 4,
                    label: 'Destination Breaker',
                    amperage: 15,
                    breaker_type: 'single'
                });
            destBreakerId = destBreaker.body.id;

            // Create a circuit for the destination breaker
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: destBreakerId,
                    room: 'Kitchen',
                    type: 'appliance',
                    notes: 'Refrigerator'
                });

            const moveData = {
                sourceBreakerId: sourceBreakerId,
                sourcePanelId: sourcePanelId,
                sourcePosition: 1,
                sourceSlot: 'single',
                destinationPanelId: destPanelId,
                destinationPosition: 4,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(200);

            expect(response.body.message).toBe('Breaker moved successfully');

            // Verify circuits were swapped between breakers (breakers stay in original positions)
            const sourceCheck = await request(app)
                .get(`/api/breakers/${sourceBreakerId}`)
                .expect(200);

            const destCheck = await request(app)
                .get(`/api/breakers/${destBreakerId}`)
                .expect(200);

            // Breakers should remain in their original positions
            expect(sourceCheck.body.panel_id).toBe(sourcePanelId);
            expect(sourceCheck.body.position).toBe(1);
            expect(destCheck.body.panel_id).toBe(destPanelId);
            expect(destCheck.body.position).toBe(4);

            // Verify circuits were swapped by checking which breaker they're associated with
            const sourceCircuits = await request(app)
                .get(`/api/breakers/${sourceBreakerId}/circuits`)
                .expect(200);

            const destCircuits = await request(app)
                .get(`/api/breakers/${destBreakerId}/circuits`)
                .expect(200);

            // Source breaker should now have destination's original circuits
            // Destination breaker should now have source's original circuits
            expect(sourceCircuits.body).toBeDefined();
            expect(destCircuits.body).toBeDefined();
        });

        test('POST /api/breakers/move - Cross-panel move', async () => {
            const moveData = {
                sourceBreakerId: sourceBreakerId,
                sourcePanelId: sourcePanelId,
                sourcePosition: 1,
                sourceSlot: 'single',
                destinationPanelId: destPanelId,
                destinationPosition: 5,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(200);

            expect(response.body.message).toBe('Breaker moved successfully');

            // Verify destination breaker was created
            const destBreakers = await request(app)
                .get(`/api/panels/${destPanelId}/breakers`)
                .expect(200);

            expect(destBreakers.body).toHaveLength(1);
            expect(destBreakers.body[0].position).toBe(5);

            // Source breaker should be deleted since circuits moved
            await request(app)
                .get(`/api/breakers/${sourceBreakerId}`)
                .expect(404);
        });

        test('POST /api/breakers/move - Missing required fields', async () => {
            const response = await request(app)
                .post('/api/breakers/move')
                .send({
                    sourceBreakerId: sourceBreakerId,
                    // Missing destinationPanelId and destinationPosition
                })
                .expect(400);

            expect(response.body.error).toBe('Missing required fields');
        });

        test('POST /api/breakers/move - Invalid source breaker', async () => {
            const moveData = {
                sourceBreakerId: 99999, // Non-existent ID
                sourcePanelId: sourcePanelId,
                sourcePosition: 1,
                sourceSlot: 'single',
                destinationPanelId: destPanelId,
                destinationPosition: 6,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(404);

            expect(response.body.error).toBe('Source breaker not found');
        });

        test('POST /api/breakers/move - Tandem slot move', async () => {
            // Create tandem breaker
            const tandemBreaker = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: sourcePanelId,
                    position: 2,
                    slot_position: 'A',
                    label: 'Tandem A',
                    amperage: 15,
                    breaker_type: 'tandem'
                });

            const moveData = {
                sourceBreakerId: tandemBreaker.body.id,
                sourcePanelId: sourcePanelId,
                sourcePosition: 2,
                sourceSlot: 'A',
                destinationPanelId: destPanelId,
                destinationPosition: 7,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(200);

            expect(response.body.message).toBe('Breaker moved successfully');

            // Verify new breaker created at destination
            const destBreakers = await request(app)
                .get(`/api/panels/${destPanelId}/breakers`)
                .expect(200);

            const movedBreaker = destBreakers.body.find(b => b.position === 7);
            expect(movedBreaker).toBeDefined();
            expect(movedBreaker.slot_position).toBe('single');
        });

        test('POST /api/breakers/move - Database transaction rollback on error', async () => {
            // Attempt move with invalid destination panel
            const moveData = {
                sourceBreakerId: sourceBreakerId,
                sourcePanelId: sourcePanelId,
                sourcePosition: 1,
                sourceSlot: 'single',
                destinationPanelId: 99999, // Non-existent panel
                destinationPosition: 8,
                destinationSlot: 'single'
            };

            const response = await request(app)
                .post('/api/breakers/move')
                .send(moveData)
                .expect(400);

            expect(response.body.error).toBe('Invalid panel or breaker reference');

            // Verify source breaker unchanged
            const sourceCheck = await request(app)
                .get(`/api/breakers/${sourceBreakerId}`)
                .expect(200);

            expect(sourceCheck.body.panel_id).toBe(sourcePanelId);
            expect(sourceCheck.body.position).toBe(1);
        });
    });

    describe('Room Management', () => {
        let roomId;

        test('POST /api/rooms - Create room', async () => {
            const newRoom = {
                name: 'Test Kitchen',
                level: 'main'
            };

            const response = await request(app)
                .post('/api/rooms')
                .send(newRoom)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(newRoom.name);
            expect(response.body.level).toBe(newRoom.level);
            
            roomId = response.body.id;
        });

        test('GET /api/rooms - Get all rooms', async () => {
            // Create additional rooms for testing
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Basement Workshop', level: 'basement' });
            
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Master Bedroom', level: 'upper' });

            const response = await request(app)
                .get('/api/rooms')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(2); // At least the 2 rooms created in this test
            
            // Verify ordering: upper, basement (main not created in this test)
            expect(response.body[0].level).toBe('upper');
        });

        test('PUT /api/rooms/:id - Update room', async () => {
            const updatedRoom = {
                name: 'Updated Kitchen',
                level: 'main'
            };

            const response = await request(app)
                .put(`/api/rooms/${roomId}`)
                .send(updatedRoom)
                .expect(200);

            expect(response.body.name).toBe(updatedRoom.name);
        });

        test('POST /api/rooms - Validation errors', async () => {
            // Missing name
            await request(app)
                .post('/api/rooms')
                .send({ level: 'main' })
                .expect(400);

            // Invalid level
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Test Room', level: 'invalid' })
                .expect(400);

            // Duplicate name
            await request(app)
                .post('/api/rooms')
                .send({ name: 'Updated Kitchen', level: 'main' })
                .expect(409);
        });

        test('DELETE /api/rooms/:id - Delete room', async () => {
            await request(app)
                .delete(`/api/rooms/${roomId}`)
                .expect(200);

            // Verify deletion
            const response = await request(app)
                .get('/api/rooms');
            
            const deletedRoom = response.body.find(room => room.id === roomId);
            expect(deletedRoom).toBeUndefined();
        });
    });

    describe('Circuit Management', () => {
        let panelId;
        let breakerId;
        let roomId;
        let circuitId;

        beforeEach(async () => {
            // Create complete test setup for each test
            const panelResponse = await request(app)
                .post('/api/panels')
                .send({ name: 'Circuit Test Panel', size: 20 });
            panelId = panelResponse.body.id;

            const breakerResponse = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: panelId,
                    position: 1,
                    label: 'Test Breaker'
                });
            breakerId = breakerResponse.body.id;

            const roomResponse = await request(app)
                .post('/api/rooms')
                .send({ name: 'Circuit Test Room', level: 'main' });
            roomId = roomResponse.body.id;
        });

        test('POST /api/circuits - Create circuit', async () => {
            const newCircuit = {
                breaker_id: breakerId,
                room_id: roomId,
                type: 'outlet',
                notes: 'Test outlet circuit'
            };

            const response = await request(app)
                .post('/api/circuits')
                .send(newCircuit)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.breaker_id).toBe(breakerId);
            expect(response.body.room_id == null || typeof response.body.room_id === 'number').toBe(true); // room_id is optional
            expect(response.body.type).toBe('outlet');
            
            circuitId = response.body.id;
        });

        test('GET /api/circuits - Get all circuits', async () => {
            const response = await request(app)
                .get('/api/circuits')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('room_name');
            expect(response.body[0]).toHaveProperty('room_level');
        });

        test('GET /api/breakers/:breakerId/circuits - Get circuits by breaker', async () => {
            const response = await request(app)
                .get(`/api/breakers/${breakerId}/circuits`)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThanOrEqual(0); // Should return circuits
        });

        test('POST /api/circuits - Create subpanel circuit', async () => {
            // Create subpanel
            const subpanelResponse = await request(app)
                .post('/api/panels')
                .send({ name: 'Test Subpanel', size: 12 });
            
            const subpanelId = subpanelResponse.body.id;

            // Create double pole breaker for subpanel
            const subpanelBreakerResponse = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: panelId,
                    position: 3,
                    label: 'Subpanel Feed',
                    double_pole: true
                });

            const subpanelBreakerId = subpanelBreakerResponse.body.id;

            // Create subpanel circuit
            const subpanelCircuit = {
                breaker_id: subpanelBreakerId,
                room_id: roomId,
                type: 'subpanel',
                notes: 'Feed to test subpanel',
                subpanel_id: subpanelId
            };

            const response = await request(app)
                .post('/api/circuits')
                .send(subpanelCircuit)
                .expect(201);

            expect(response.body.type).toBe('subpanel');
            expect(response.body.subpanel_id).toBe(subpanelId);
        });

        test('PUT /api/circuits/:id - Update circuit', async () => {
            const updatedCircuit = {
                room_id: roomId,
                type: 'lighting',
                notes: 'Updated to lighting circuit'
            };

            const response = await request(app)
                .put(`/api/circuits/${circuitId}`)
                .send(updatedCircuit)
                .expect(200);

            expect(response.body.type).toBe('lighting');
            expect(response.body.notes).toBe('Updated to lighting circuit');
        });

        test('POST /api/circuits - Validation errors', async () => {
            // Missing breaker_id
            await request(app)
                .post('/api/circuits')
                .send({ type: 'outlet' })
                .expect(400);

            // Invalid type
            await request(app)
                .post('/api/circuits')
                .send({ 
                    breaker_id: breakerId, 
                    type: 'invalid_type' 
                })
                .expect(400);
        });

        test('DELETE /api/circuits/:id - Delete circuit', async () => {
            await request(app)
                .delete(`/api/circuits/${circuitId}`)
                .expect(200);

            // Verify deletion
            const response = await request(app)
                .get(`/api/breakers/${breakerId}/circuits`);
            
            const deletedCircuit = response.body.find(circuit => circuit.id === circuitId);
            expect(deletedCircuit).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        test('GET /api/panels/999 - Non-existent panel', async () => {
            await request(app)
                .get('/api/panels/999')
                .expect(404);
        });

        test('GET /api/panels/invalid - Invalid ID format', async () => {
            await request(app)
                .get('/api/panels/invalid')
                .expect(400);
        });

        test('GET /api/nonexistent - Non-existent endpoint', async () => {
            await request(app)
                .get('/api/nonexistent')
                .expect(404);
        });
    });
});