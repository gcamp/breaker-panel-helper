/**
 * StateManager - Centralized state management with automatic cache invalidation
 * Eliminates synchronization bugs between multiple caches
 */

class StateManager {
    constructor() {
        // Single source of truth for all application state
        this.state = {
            panels: new Map(),      // id -> panel
            breakers: new Map(),    // id -> breaker
            circuits: new Map(),    // id -> circuit
            rooms: new Map()        // id -> room
        };

        // Indexes for efficient lookups
        this.indexes = {
            breakersByPanel: new Map(),     // panelId -> Set<breakerId>
            breakersByPosition: new Map(),  // "panelId:position:slot" -> breakerId
            circuitsByBreaker: new Map(),   // breakerId -> Set<circuitId>
            roomsByLevel: new Map()         // level -> Set<roomId>
        };

        // Event subscribers for reactive updates
        this.subscribers = new Set();

        // Track loading state
        this.loading = {
            panels: false,
            breakers: false,
            circuits: false,
            rooms: false
        };
    }

    // ============================================================================
    // PANEL OPERATIONS
    // ============================================================================

    /**
     * Set all panels at once (typically from API fetch)
     * @param {Array<Object>} panels - Array of panel objects
     */
    setPanels(panels) {
        this.state.panels.clear();
        panels.forEach(panel => {
            this.state.panels.set(panel.id, Object.freeze({ ...panel }));
        });
        this.notify({ type: 'panels', action: 'set', data: panels });
    }

    /**
     * Add or update a single panel
     * @param {Object} panel - Panel object
     */
    setPanel(panel) {
        this.state.panels.set(panel.id, Object.freeze({ ...panel }));
        this.notify({ type: 'panel', action: 'update', id: panel.id, data: panel });
    }

    /**
     * Remove a panel and all associated data
     * @param {number} panelId
     */
    removePanel(panelId) {
        // Remove associated breakers
        const breakerIds = this.indexes.breakersByPanel.get(panelId) || new Set();
        breakerIds.forEach(breakerId => this.removeBreaker(breakerId));

        this.state.panels.delete(panelId);
        this.indexes.breakersByPanel.delete(panelId);
        this.notify({ type: 'panel', action: 'delete', id: panelId });
    }

    /**
     * Get a panel by ID
     * @param {number} panelId
     * @returns {Object|undefined}
     */
    getPanel(panelId) {
        return this.state.panels.get(panelId);
    }

    /**
     * Get all panels as array
     * @returns {Array<Object>}
     */
    getAllPanels() {
        return Array.from(this.state.panels.values());
    }

    // ============================================================================
    // BREAKER OPERATIONS
    // ============================================================================

    /**
     * Set all breakers at once
     * @param {Array<Object>} breakers
     */
    setBreakers(breakers) {
        this.state.breakers.clear();
        this.indexes.breakersByPanel.clear();
        this.indexes.breakersByPosition.clear();

        breakers.forEach(breaker => this._addBreakerToIndexes(breaker));
        this.notify({ type: 'breakers', action: 'set', data: breakers });
    }

    /**
     * Add or update a single breaker
     * @param {Object} breaker
     */
    setBreaker(breaker) {
        // Remove old indexes if updating
        const oldBreaker = this.state.breakers.get(breaker.id);
        if (oldBreaker) {
            this._removeBreakerFromIndexes(oldBreaker);
        }

        this._addBreakerToIndexes(breaker);
        this.notify({ type: 'breaker', action: 'update', id: breaker.id, data: breaker });
    }

    /**
     * Remove a breaker and all associated circuits
     * @param {number} breakerId
     */
    removeBreaker(breakerId) {
        const breaker = this.state.breakers.get(breakerId);
        if (!breaker) return;

        // Remove associated circuits
        const circuitIds = this.indexes.circuitsByBreaker.get(breakerId) || new Set();
        circuitIds.forEach(circuitId => this.removeCircuit(circuitId));

        this._removeBreakerFromIndexes(breaker);
        this.notify({ type: 'breaker', action: 'delete', id: breakerId });
    }

    /**
     * Get a breaker by ID
     * @param {number} breakerId
     * @returns {Object|undefined}
     */
    getBreaker(breakerId) {
        return this.state.breakers.get(breakerId);
    }

    /**
     * Get breaker at specific position
     * @param {number} panelId
     * @param {number} position
     * @param {string} slot - 'single', 'A', or 'B'
     * @returns {Object|undefined}
     */
    getBreakerByPosition(panelId, position, slot = 'single') {
        const key = this._makePositionKey(panelId, position, slot);
        const breakerId = this.indexes.breakersByPosition.get(key);
        return breakerId ? this.state.breakers.get(breakerId) : undefined;
    }

    /**
     * Get all breakers at a position (for tandem breakers)
     * @param {number} panelId
     * @param {number} position
     * @returns {Array<Object>}
     */
    getBreakersAtPosition(panelId, position) {
        const breakers = [];
        for (const slot of ['single', 'A', 'B']) {
            const breaker = this.getBreakerByPosition(panelId, position, slot);
            if (breaker) breakers.push(breaker);
        }
        return breakers;
    }

    /**
     * Get all breakers for a panel
     * @param {number} panelId
     * @returns {Array<Object>}
     */
    getBreakersByPanel(panelId) {
        const breakerIds = this.indexes.breakersByPanel.get(panelId) || new Set();
        return Array.from(breakerIds)
            .map(id => this.state.breakers.get(id))
            .filter(Boolean)
            .sort((a, b) => a.position - b.position);
    }

    // ============================================================================
    // CIRCUIT OPERATIONS
    // ============================================================================

    /**
     * Set all circuits at once
     * @param {Array<Object>} circuits
     */
    setCircuits(circuits) {
        this.state.circuits.clear();
        this.indexes.circuitsByBreaker.clear();

        circuits.forEach(circuit => this._addCircuitToIndexes(circuit));
        this.notify({ type: 'circuits', action: 'set', data: circuits });
    }

    /**
     * Add or update a single circuit
     * @param {Object} circuit
     */
    setCircuit(circuit) {
        // Remove old indexes if updating
        const oldCircuit = this.state.circuits.get(circuit.id);
        if (oldCircuit) {
            this._removeCircuitFromIndexes(oldCircuit);
        }

        this._addCircuitToIndexes(circuit);
        this.notify({ type: 'circuit', action: 'update', id: circuit.id, data: circuit });
    }

    /**
     * Remove a circuit
     * @param {number} circuitId
     */
    removeCircuit(circuitId) {
        const circuit = this.state.circuits.get(circuitId);
        if (!circuit) return;

        this._removeCircuitFromIndexes(circuit);
        this.notify({ type: 'circuit', action: 'delete', id: circuitId });
    }

    /**
     * Get a circuit by ID
     * @param {number} circuitId
     * @returns {Object|undefined}
     */
    getCircuit(circuitId) {
        return this.state.circuits.get(circuitId);
    }

    /**
     * Get all circuits for a breaker
     * @param {number} breakerId
     * @returns {Array<Object>}
     */
    getCircuitsByBreaker(breakerId) {
        const circuitIds = this.indexes.circuitsByBreaker.get(breakerId) || new Set();
        return Array.from(circuitIds)
            .map(id => this.state.circuits.get(id))
            .filter(Boolean);
    }

    /**
     * Get all circuits
     * @returns {Array<Object>}
     */
    getAllCircuits() {
        return Array.from(this.state.circuits.values());
    }

    // ============================================================================
    // ROOM OPERATIONS
    // ============================================================================

    /**
     * Set all rooms at once
     * @param {Array<Object>} rooms
     */
    setRooms(rooms) {
        this.state.rooms.clear();
        this.indexes.roomsByLevel.clear();

        rooms.forEach(room => this._addRoomToIndexes(room));
        this.notify({ type: 'rooms', action: 'set', data: rooms });
    }

    /**
     * Add or update a single room
     * @param {Object} room
     */
    setRoom(room) {
        const oldRoom = this.state.rooms.get(room.id);
        if (oldRoom) {
            this._removeRoomFromIndexes(oldRoom);
        }

        this._addRoomToIndexes(room);
        this.notify({ type: 'room', action: 'update', id: room.id, data: room });
    }

    /**
     * Remove a room
     * @param {number} roomId
     */
    removeRoom(roomId) {
        const room = this.state.rooms.get(roomId);
        if (!room) return;

        this._removeRoomFromIndexes(room);
        this.notify({ type: 'room', action: 'delete', id: roomId });
    }

    /**
     * Get a room by ID
     * @param {number} roomId
     * @returns {Object|undefined}
     */
    getRoom(roomId) {
        return this.state.rooms.get(roomId);
    }

    /**
     * Get all rooms
     * @returns {Array<Object>}
     */
    getAllRooms() {
        return Array.from(this.state.rooms.values());
    }

    /**
     * Get rooms by level
     * @param {string} level
     * @returns {Array<Object>}
     */
    getRoomsByLevel(level) {
        const roomIds = this.indexes.roomsByLevel.get(level) || new Set();
        return Array.from(roomIds)
            .map(id => this.state.rooms.get(id))
            .filter(Boolean);
    }

    // ============================================================================
    // PRIVATE INDEX MANAGEMENT
    // ============================================================================

    _addBreakerToIndexes(breaker) {
        this.state.breakers.set(breaker.id, Object.freeze({ ...breaker }));

        // Index by panel
        if (!this.indexes.breakersByPanel.has(breaker.panel_id)) {
            this.indexes.breakersByPanel.set(breaker.panel_id, new Set());
        }
        this.indexes.breakersByPanel.get(breaker.panel_id).add(breaker.id);

        // Index by position
        const key = this._makePositionKey(breaker.panel_id, breaker.position, breaker.slot_position || 'single');
        this.indexes.breakersByPosition.set(key, breaker.id);
    }

    _removeBreakerFromIndexes(breaker) {
        this.state.breakers.delete(breaker.id);

        // Remove from panel index
        const panelBreakers = this.indexes.breakersByPanel.get(breaker.panel_id);
        if (panelBreakers) {
            panelBreakers.delete(breaker.id);
            if (panelBreakers.size === 0) {
                this.indexes.breakersByPanel.delete(breaker.panel_id);
            }
        }

        // Remove from position index
        const key = this._makePositionKey(breaker.panel_id, breaker.position, breaker.slot_position || 'single');
        this.indexes.breakersByPosition.delete(key);
    }

    _addCircuitToIndexes(circuit) {
        this.state.circuits.set(circuit.id, Object.freeze({ ...circuit }));

        // Index by breaker
        if (!this.indexes.circuitsByBreaker.has(circuit.breaker_id)) {
            this.indexes.circuitsByBreaker.set(circuit.breaker_id, new Set());
        }
        this.indexes.circuitsByBreaker.get(circuit.breaker_id).add(circuit.id);
    }

    _removeCircuitFromIndexes(circuit) {
        this.state.circuits.delete(circuit.id);

        // Remove from breaker index
        const breakerCircuits = this.indexes.circuitsByBreaker.get(circuit.breaker_id);
        if (breakerCircuits) {
            breakerCircuits.delete(circuit.id);
            if (breakerCircuits.size === 0) {
                this.indexes.circuitsByBreaker.delete(circuit.breaker_id);
            }
        }
    }

    _addRoomToIndexes(room) {
        this.state.rooms.set(room.id, Object.freeze({ ...room }));

        // Index by level
        if (!this.indexes.roomsByLevel.has(room.level)) {
            this.indexes.roomsByLevel.set(room.level, new Set());
        }
        this.indexes.roomsByLevel.get(room.level).add(room.id);
    }

    _removeRoomFromIndexes(room) {
        this.state.rooms.delete(room.id);

        // Remove from level index
        const levelRooms = this.indexes.roomsByLevel.get(room.level);
        if (levelRooms) {
            levelRooms.delete(room.id);
            if (levelRooms.size === 0) {
                this.indexes.roomsByLevel.delete(room.level);
            }
        }
    }

    _makePositionKey(panelId, position, slot) {
        return `${panelId}:${position}:${slot}`;
    }

    // ============================================================================
    // SUBSCRIPTION MANAGEMENT
    // ============================================================================

    /**
     * Subscribe to state changes
     * @param {Function} callback - Called with event object on state changes
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Notify all subscribers of a state change
     * @param {Object} event - Event object with type, action, id, data
     * @private
     */
    notify(event) {
        this.subscribers.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('Subscriber error:', error);
            }
        });
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Clear all state (useful for testing)
     */
    clear() {
        this.state.panels.clear();
        this.state.breakers.clear();
        this.state.circuits.clear();
        this.state.rooms.clear();

        this.indexes.breakersByPanel.clear();
        this.indexes.breakersByPosition.clear();
        this.indexes.circuitsByBreaker.clear();
        this.indexes.roomsByLevel.clear();

        this.notify({ type: 'state', action: 'clear' });
    }

    /**
     * Get current state snapshot (for debugging)
     * @returns {Object}
     */
    getSnapshot() {
        return {
            panels: this.getAllPanels(),
            breakers: Array.from(this.state.breakers.values()),
            circuits: Array.from(this.state.circuits.values()),
            rooms: Array.from(this.state.rooms.values()),
            indexes: {
                breakersByPanel: Object.fromEntries(
                    Array.from(this.indexes.breakersByPanel.entries())
                        .map(([k, v]) => [k, Array.from(v)])
                ),
                circuitsByBreaker: Object.fromEntries(
                    Array.from(this.indexes.circuitsByBreaker.entries())
                        .map(([k, v]) => [k, Array.from(v)])
                )
            }
        };
    }
}

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateManager;
} else if (typeof global !== 'undefined') {
    global.StateManager = StateManager;
}
