/**
 * BreakerPosition - Domain model for breaker position logic
 * Encapsulates all position-related business rules
 */

class BreakerPosition {
    /**
     * @param {number} position - Position number (1-based)
     * @param {string} slot - Slot position ('single', 'A', or 'B')
     * @throws {Error} If position is invalid
     */
    constructor(position, slot = 'single') {
        if (!Number.isInteger(position) || position < 1) {
            throw new Error(`Invalid position: ${position}. Position must be a positive integer.`);
        }

        const validSlots = ['single', 'A', 'B'];
        if (!validSlots.includes(slot)) {
            throw new Error(`Invalid slot: ${slot}. Must be one of: ${validSlots.join(', ')}`);
        }

        this.position = position;
        this.slot = slot;
    }

    /**
     * Is this position on the left side (odd number)?
     * @returns {boolean}
     */
    get isLeft() {
        return this.position % 2 === 1;
    }

    /**
     * Is this position on the right side (even number)?
     * @returns {boolean}
     */
    get isRight() {
        return this.position % 2 === 0;
    }

    /**
     * Is this position odd?
     * @returns {boolean}
     */
    get isOdd() {
        return this.isLeft;
    }

    /**
     * Is this position even?
     * @returns {boolean}
     */
    get isEven() {
        return this.isRight;
    }

    /**
     * Is this a tandem slot?
     * @returns {boolean}
     */
    get isTandem() {
        return this.slot === 'A' || this.slot === 'B';
    }

    /**
     * Is this a single slot?
     * @returns {boolean}
     */
    get isSingle() {
        return this.slot === 'single';
    }

    /**
     * Get the position range for a double pole breaker
     * Double pole breakers span 2 vertical positions (e.g., 1-3, 2-4)
     * @returns {Array<number>} Array of [start, end] positions
     * @throws {Error} If double pole cannot start on even position
     */
    getDoublePoleRange() {
        if (this.isEven) {
            throw new Error(`Double pole breaker must start on an odd position, not ${this.position}`);
        }
        return [this.position, this.position + 2];
    }

    /**
     * Get the position that would be hidden by a double pole at this position
     * @returns {number}
     */
    getDoublePoleHiddenPosition() {
        return this.position + 2;
    }

    /**
     * Check if this position can accommodate a double pole breaker
     * @param {number} panelSize - Total panel size
     * @returns {boolean}
     */
    canHaveDoublePole(panelSize) {
        return this.isOdd && (this.position + 2) <= panelSize;
    }

    /**
     * Get unique cache key for this position
     * @returns {string}
     */
    getCacheKey() {
        return `${this.position}:${this.slot}`;
    }

    /**
     * Get cache key with panel ID
     * @param {number} panelId - Panel ID
     * @returns {string}
     */
    getPanelCacheKey(panelId) {
        return `${panelId}:${this.position}:${this.slot}`;
    }

    /**
     * Get display label for this position
     * @returns {string}
     */
    getDisplayLabel() {
        if (this.isTandem) {
            return `${this.position}${this.slot}`;
        }
        return `${this.position}`;
    }

    /**
     * Get display label for double pole breaker
     * @returns {string}
     */
    getDoublePoleLabel() {
        const [start, end] = this.getDoublePoleRange();
        return `${start}-${end}`;
    }

    /**
     * Check if another position is the same
     * @param {BreakerPosition} other
     * @returns {boolean}
     */
    equals(other) {
        return other instanceof BreakerPosition &&
            this.position === other.position &&
            this.slot === other.slot;
    }

    /**
     * Create BreakerPosition from cache key
     * @param {string} key - Cache key in format "position:slot" or "panelId:position:slot"
     * @returns {BreakerPosition}
     */
    static fromCacheKey(key) {
        const parts = key.split(':');

        if (parts.length === 2) {
            // Format: "position:slot"
            const [position, slot] = parts;
            return new BreakerPosition(parseInt(position), slot);
        } else if (parts.length === 3) {
            // Format: "panelId:position:slot"
            const [, position, slot] = parts;
            return new BreakerPosition(parseInt(position), slot);
        }

        throw new Error(`Invalid cache key format: ${key}`);
    }

    /**
     * Create BreakerPosition from breaker object
     * @param {Object} breaker - Breaker object with position and slot_position
     * @returns {BreakerPosition}
     */
    static fromBreaker(breaker) {
        return new BreakerPosition(
            breaker.position,
            breaker.slot_position || 'single'
        );
    }

    /**
     * Validate position number
     * @param {*} position - Position to validate
     * @returns {boolean}
     */
    static isValidPosition(position) {
        return Number.isInteger(position) && position > 0;
    }

    /**
     * Validate slot
     * @param {*} slot - Slot to validate
     * @returns {boolean}
     */
    static isValidSlot(slot) {
        return ['single', 'A', 'B'].includes(slot);
    }

    /**
     * Get positions range
     * @param {number} start - Start position
     * @param {number} end - End position
     * @returns {Array<number>}
     */
    static getRange(start, end) {
        if (!this.isValidPosition(start) || !this.isValidPosition(end)) {
            throw new Error('Start and end must be valid positions');
        }
        if (start > end) {
            throw new Error('Start position must be <= end position');
        }

        const range = [];
        for (let i = start; i <= end; i++) {
            range.push(i);
        }
        return range;
    }

    /**
     * Convert to JSON representation
     * @returns {Object}
     */
    toJSON() {
        return {
            position: this.position,
            slot: this.slot,
            isLeft: this.isLeft,
            isRight: this.isRight,
            isTandem: this.isTandem,
            isSingle: this.isSingle
        };
    }

    /**
     * String representation
     * @returns {string}
     */
    toString() {
        return this.getDisplayLabel();
    }
}

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BreakerPosition;
} else if (typeof global !== 'undefined') {
    global.BreakerPosition = BreakerPosition;
}
