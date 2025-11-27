/**
 * Jest Test Setup
 * Global configuration and utilities for tests
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
    /**
     * Wait for a specified amount of time
     * @param {number} ms - Milliseconds to wait
     */
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    /**
     * Generate random test data
     */
    generateTestPanel: () => ({
        name: `Test Panel ${Math.random().toString(36).substr(2, 9)}`,
        size: [12, 20, 24, 30, 40, 42][Math.floor(Math.random() * 6)]
    }),

    generateTestBreaker: (panelId) => ({
        panel_id: panelId,
        position: Math.floor(Math.random() * 40) + 1,
        label: `Test Breaker ${Math.random().toString(36).substr(2, 9)}`,
        amperage: [15, 20, 30, 40, 50][Math.floor(Math.random() * 5)],
        monitor: Math.random() > 0.5,
        confirmed: Math.random() > 0.5,
        double_pole: Math.random() > 0.8 // Less likely
    }),

    generateTestRoom: () => ({
        name: `Test Room ${Math.random().toString(36).substr(2, 9)}`,
        level: ['basement', 'main', 'upper'][Math.floor(Math.random() * 3)]
    }),

    generateTestCircuit: (breakerId, roomId) => ({
        breaker_id: breakerId,
        room_id: roomId,
        type: ['outlet', 'lighting', 'heating', 'appliance'][Math.floor(Math.random() * 4)],
        notes: `Test circuit notes ${Math.random().toString(36).substr(2, 9)}`
    }),

    /**
     * Clean up test files
     */
    cleanupTestFiles: () => {
        const fs = require('fs');
        const testFiles = [
            'test_api.db',
            'test_integration.db',
            'test_frontend.db'
        ];
        
        testFiles.forEach(file => {
            if (fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                } catch (error) {
                    console.warn(`Could not delete test file ${file}:`, error.message);
                }
            }
        });
    }
};

// Mock console methods for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
    // Only show console.error in tests if it's not expected
    if (!args[0]?.includes?.('Test')) {
        originalConsoleError(...args);
    }
};

console.warn = (...args) => {
    // Only show console.warn in tests if it's not expected
    if (!args[0]?.includes?.('Test')) {
        originalConsoleWarn(...args);
    }
};

// Cleanup after all tests
afterAll(() => {
    global.testUtils.cleanupTestFiles();
    
    // Restore console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
});