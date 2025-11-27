const request = require('supertest');
const fs = require('fs');

// Import the app
const app = require('../server.js');
const { connectDB } = require('../server.js');

describe('Integration Tests - Real-world Scenarios', () => {
    const TEST_DB_PATH = `test_integration_${Date.now()}.db`;

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

    describe('Complete Electrical Panel Setup', () => {
        let mainPanelId;
        let garagePanelId;
        let workshopPanelId;
        let kitchenRoomId;
        let garageRoomId;
        let workshopRoomId;

        test('Setup complete electrical system', async () => {
            // 1. Create rooms with different levels
            console.log('Creating rooms...');
            
            const kitchenRoom = await request(app)
                .post('/api/rooms')
                .send({ name: 'Kitchen', level: 'main' });
            kitchenRoomId = kitchenRoom.body.id;

            const garageRoom = await request(app)
                .post('/api/rooms')
                .send({ name: 'Garage', level: 'main' });
            garageRoomId = garageRoom.body.id;

            const workshopRoom = await request(app)
                .post('/api/rooms')
                .send({ name: 'Workshop', level: 'basement' });
            workshopRoomId = workshopRoom.body.id;

            // 2. Create main panel
            console.log('Creating main panel...');
            const mainPanel = await request(app)
                .post('/api/panels')
                .send({ name: 'Main Panel', size: 40 });
            mainPanelId = mainPanel.body.id;

            // 3. Create subpanels
            console.log('Creating subpanels...');
            const garagePanel = await request(app)
                .post('/api/panels')
                .send({ name: 'Garage Subpanel', size: 20 });
            garagePanelId = garagePanel.body.id;

            const workshopPanel = await request(app)
                .post('/api/panels')
                .send({ name: 'Workshop Subpanel', size: 12 });
            workshopPanelId = workshopPanel.body.id;

            // 4. Create main panel breakers
            console.log('Creating main panel breakers...');
            
            // Single pole breaker
            const kitchenOutlets = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: mainPanelId,
                    position: 1,
                    label: 'Kitchen Outlets',
                    amperage: 20,
                    monitor: false,
                    confirmed: true
                });

            // Double pole breaker for subpanel feed
            const garageFeed = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: mainPanelId,
                    position: 3,
                    label: 'Garage Subpanel Feed',
                    amperage: 60,
                    monitor: false,
                    confirmed: true,
                    breaker_type: 'double_pole'
                });

            // Tandem breakers
            await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: mainPanelId,
                    position: 5,
                    label: 'Bedroom Outlets A',
                    amperage: 15,
                    breaker_type: 'tandem',
                    slot_position: 'A'
                });

            await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: mainPanelId,
                    position: 5,
                    label: 'Bedroom Outlets B',
                    amperage: 15,
                    breaker_type: 'tandem',
                    slot_position: 'B'
                });

            // 5. Create garage subpanel breakers
            console.log('Creating garage subpanel breakers...');
            
            const garageDoor = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: garagePanelId,
                    position: 1,
                    label: 'Garage Door Opener',
                    amperage: 15
                });

            const workshopFeed = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: garagePanelId,
                    position: 3,
                    label: 'Workshop Subpanel Feed',
                    amperage: 30,
                    breaker_type: 'double_pole'
                });

            // 6. Create workshop subpanel breakers
            console.log('Creating workshop subpanel breakers...');
            
            const tableSaw = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: workshopPanelId,
                    position: 1,
                    label: 'Table Saw',
                    amperage: 20
                });

            // 7. Create circuits
            console.log('Creating circuits...');
            
            // Kitchen outlet circuits
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: kitchenOutlets.body.id,
                    room_id: kitchenRoomId,
                    type: 'outlet',
                    notes: 'Counter outlets'
                });

            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: kitchenOutlets.body.id,
                    room_id: kitchenRoomId,
                    type: 'appliance',
                    notes: 'Microwave outlet'
                });

            // Subpanel feed circuit
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: garageFeed.body.id,
                    room_id: garageRoomId,
                    type: 'subpanel',
                    notes: 'Main feed to garage electrical panel',
                    subpanel_id: garagePanelId
                });

            // Garage door circuit
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: garageDoor.body.id,
                    room_id: garageRoomId,
                    type: 'appliance',
                    notes: 'Overhead garage door motor'
                });

            // Workshop feed circuit
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: workshopFeed.body.id,
                    room_id: workshopRoomId,
                    type: 'subpanel',
                    notes: 'Feed to workshop panel',
                    subpanel_id: workshopPanelId
                });

            // Workshop circuit
            await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: tableSaw.body.id,
                    room_id: workshopRoomId,
                    type: 'appliance',
                    notes: 'Cabinet table saw 220V'
                });

            expect(mainPanelId).toBeDefined();
            expect(garagePanelId).toBeDefined();
            expect(workshopPanelId).toBeDefined();
        });

        test('Verify panel hierarchy and relationships', async () => {
            // Get all panels
            const panelsResponse = await request(app)
                .get('/api/panels')
                .expect(200);

            expect(panelsResponse.body.length).toBeGreaterThanOrEqual(3);

            // Get main panel breakers
            const mainBreakersResponse = await request(app)
                .get(`/api/panels/${mainPanelId}/breakers`)
                .expect(200);

            // Should have 4 breakers (1 single, 1 double, 2 tandem)
            expect(mainBreakersResponse.body).toHaveLength(4);

            // Verify double pole breaker
            const doublePoleBreaker = mainBreakersResponse.body.find(b => b.breaker_type === 'double_pole');
            expect(doublePoleBreaker).toBeDefined();

            // Verify tandem breakers
            const tandemBreakers = mainBreakersResponse.body.filter(b => b.breaker_type === 'tandem');
            expect(tandemBreakers).toHaveLength(2);
            expect(tandemBreakers.find(b => b.slot_position === 'A')).toBeDefined();
            expect(tandemBreakers.find(b => b.slot_position === 'B')).toBeDefined();
        });

        test('Verify circuit relationships and data integrity', async () => {
            // Get all circuits
            const circuitsResponse = await request(app)
                .get('/api/circuits')
                .expect(200);

            expect(circuitsResponse.body.length).toBeGreaterThan(0);

            // Verify room information is included
            const circuitsWithRooms = circuitsResponse.body.filter(c => c.room_name);
            expect(circuitsWithRooms.length).toBeGreaterThan(0);

            // Verify subpanel circuits
            const subpanelCircuits = circuitsResponse.body.filter(c => c.type === 'subpanel');
            expect(subpanelCircuits.length).toBeGreaterThanOrEqual(2); // At least Garage and Workshop feeds

            // Each subpanel circuit should have a subpanel_id
            subpanelCircuits.forEach(circuit => {
                expect(circuit.subpanel_id).toBeDefined();
                expect(circuit.subpanel_id).toBeGreaterThan(0);
            });
        });

        test('Test complex queries and filtering', async () => {
            // Get breakers by position for tandem test
            const tandemPositionResponse = await request(app)
                .get(`/api/panels/${mainPanelId}/breakers/position/5?slot_position=A`)
                .expect(200);

            expect(tandemPositionResponse.body).toBeDefined();
            expect(tandemPositionResponse.body.slot_position).toBe('A');

            // Get both tandem breakers
            const bothTandemResponse = await request(app)
                .get(`/api/panels/${mainPanelId}/breakers/position/5?slot_position=both`)
                .expect(200);

            expect(Array.isArray(bothTandemResponse.body)).toBe(true);
            expect(bothTandemResponse.body).toHaveLength(2);
        });

    });

    describe('Load Testing and Performance', () => {
        let panelId;

        beforeAll(async () => {
            const panel = await request(app)
                .post('/api/panels')
                .send({ name: 'Load Test Panel', size: 42 });
            panelId = panel.body.id;
        });

        test('Create many breakers efficiently', async () => {
            const start = Date.now();
            const promises = [];

            // Create 42 breakers (full panel)
            for (let i = 1; i <= 42; i++) {
                promises.push(
                    request(app)
                        .post('/api/breakers')
                        .send({
                            panel_id: panelId,
                            position: i,
                            label: `Breaker ${i}`,
                            amperage: 15 + (i % 3) * 5 // Vary amperage
                        })
                );
            }

            const responses = await Promise.all(promises);
            const duration = Date.now() - start;

            // All should succeed
            responses.forEach(response => {
                expect(response.status).toBe(201);
            });

            // Should complete in reasonable time (adjust as needed)
            expect(duration).toBeLessThan(5000); // 5 seconds

            console.log(`Created 42 breakers in ${duration}ms`);
        });

        test('Query large dataset efficiently', async () => {
            const start = Date.now();

            const response = await request(app)
                .get(`/api/panels/${panelId}/breakers`)
                .expect(200);

            const duration = Date.now() - start;

            expect(response.body).toHaveLength(42);
            expect(duration).toBeLessThan(1000); // 1 second

            console.log(`Retrieved 42 breakers in ${duration}ms`);
        });
    });

    describe('Edge Cases and Error Scenarios', () => {
        test('Handle concurrent tandem breaker creation', async () => {
            // Create a new panel for this test
            const panel = await request(app)
                .post('/api/panels')
                .send({ name: 'Concurrent Test Panel', size: 20 });
            
            const panelId = panel.body.id;

            // Try to create two tandem breakers at the same position simultaneously
            const promises = [
                request(app)
                    .post('/api/breakers')
                    .send({
                        panel_id: panelId,
                        position: 1,
                        breaker_type: 'tandem',
                        slot_position: 'A'
                    }),
                request(app)
                    .post('/api/breakers')
                    .send({
                        panel_id: panelId,
                        position: 1,
                        breaker_type: 'tandem',
                        slot_position: 'A'
                    })
            ];

            const results = await Promise.allSettled(promises);

            // One should succeed, one should fail with constraint error
            const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
            const failures = results.filter(r => r.status === 'fulfilled' && r.value.status === 409);

            expect(successes).toHaveLength(1);
            expect(failures).toHaveLength(1);
        });

        test('Handle invalid foreign key relationships', async () => {
            // Try to create breaker with non-existent panel - should fail with foreign key constraint
            const response = await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: 99999,
                    position: 1
                });
                
            // Should fail with either 400 (validation) or 409 (constraint), but not 201 (success)
            expect(response.status).not.toBe(201);

            // Try to create circuit with non-existent breaker - should fail with foreign key constraint
            const circuitResponse = await request(app)
                .post('/api/circuits')
                .send({
                    breaker_id: 99999,
                    type: 'outlet'
                });
                
            // Should fail with either validation error or constraint error, but not 201 (success)
            expect(circuitResponse.status).not.toBe(201);
        });

        test('Handle malformed request data', async () => {
            // Send non-JSON data
            await request(app)
                .post('/api/panels')
                .send('invalid json')
                .expect(400);

            // Send null values where not allowed
            await request(app)
                .post('/api/panels')
                .send({
                    name: null,
                    size: 40
                })
                .expect(400);
        });

        test('Verify database constraints are enforced', async () => {
            const panel = await request(app)
                .post('/api/panels')
                .send({ name: 'Constraint Test Panel', size: 20 });
            
            const panelId = panel.body.id;

            // Try to create breaker with position 0 (should fail check constraint)
            await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: panelId,
                    position: 0
                })
                .expect(400);

            // Try to create breaker with invalid amperage
            await request(app)
                .post('/api/breakers')
                .send({
                    panel_id: panelId,
                    position: 1,
                    amperage: 0
                })
                .expect(400);
        });
    });
});