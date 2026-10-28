/**
 * DOMHelpers - Safe DOM access utilities to prevent null reference errors
 */

class DOMHelpers {
    /**
     * Get an element that must exist, throw error if not found
     * @param {string} id - Element ID
     * @returns {HTMLElement}
     * @throws {Error} If element not found
     */
    static getRequiredElement(id) {
        const el = document.getElementById(id);
        if (!el) {
            throw new Error(`Required element #${id} not found in DOM`);
        }
        return el;
    }

    /**
     * Get an optional element, returns null if not found
     * @param {string} id - Element ID
     * @returns {HTMLElement|null}
     */
    static getOptionalElement(id) {
        return document.getElementById(id);
    }

    /**
     * Safely update an element if it exists
     * @param {string} id - Element ID
     * @param {Function} updater - Function that receives the element
     * @returns {boolean} True if element was found and updated
     */
    static updateElement(id, updater) {
        const el = this.getOptionalElement(id);
        if (el) {
            try {
                updater(el);
                return true;
            } catch (error) {
                console.error(`Error updating element #${id}:`, error);
                return false;
            }
        }
        return false;
    }

    /**
     * Set text content safely
     * @param {string} id - Element ID
     * @param {string} text - Text to set
     * @returns {boolean} True if successful
     */
    static setText(id, text) {
        return this.updateElement(id, el => {
            el.textContent = text;
        });
    }

    /**
     * Set value safely (for inputs)
     * @param {string} id - Element ID
     * @param {*} value - Value to set
     * @returns {boolean} True if successful
     */
    static setValue(id, value) {
        return this.updateElement(id, el => {
            if (el.type === 'checkbox') {
                el.checked = Boolean(value);
            } else {
                el.value = value ?? '';
            }
        });
    }

    /**
     * Get value safely (for inputs)
     * @param {string} id - Element ID
     * @param {*} defaultValue - Default value if element not found
     * @returns {*}
     */
    static getValue(id, defaultValue = '') {
        const el = this.getOptionalElement(id);
        if (!el) return defaultValue;

        if (el.type === 'checkbox') {
            return el.checked;
        }
        return el.value;
    }

    /**
     * Show or hide an element
     * @param {string} id - Element ID
     * @param {boolean} visible - True to show, false to hide
     * @returns {boolean} True if successful
     */
    static setVisible(id, visible) {
        return this.updateElement(id, el => {
            el.style.display = visible ? '' : 'none';
        });
    }

    /**
     * Add or remove a class
     * @param {string} id - Element ID
     * @param {string} className - Class name
     * @param {boolean} add - True to add, false to remove
     * @returns {boolean} True if successful
     */
    static toggleClass(id, className, add) {
        return this.updateElement(id, el => {
            el.classList.toggle(className, add);
        });
    }

    /**
     * Enable or disable an element
     * @param {string} id - Element ID
     * @param {boolean} enabled - True to enable, false to disable
     * @returns {boolean} True if successful
     */
    static setEnabled(id, enabled) {
        return this.updateElement(id, el => {
            if ('disabled' in el) {
                el.disabled = !enabled;
            }
        });
    }

    /**
     * Show a modal by ID
     * @param {string} id - Modal element ID
     * @returns {boolean} True if successful
     */
    static showModal(id) {
        return this.updateElement(id, el => {
            el.style.display = 'block';
        });
    }

    /**
     * Hide a modal by ID
     * @param {string} id - Modal element ID
     * @returns {boolean} True if successful
     */
    static hideModal(id) {
        return this.updateElement(id, el => {
            el.style.display = 'none';
        });
    }

    /**
     * Safely bind an event listener
     * @param {string} id - Element ID
     * @param {string} event - Event name
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     * @returns {boolean} True if successful
     */
    static bindEvent(id, event, handler, options = {}) {
        const el = this.getOptionalElement(id);
        if (el) {
            el.addEventListener(event, handler, options);
            return true;
        }
        console.warn(`Element with ID '${id}' not found for event binding`);
        return false;
    }

    /**
     * Query selector with error handling
     * @param {string} selector - CSS selector
     * @param {Element} parent - Parent element (defaults to document)
     * @returns {Element|null}
     */
    static query(selector, parent = document) {
        try {
            return parent.querySelector(selector);
        } catch (error) {
            console.error(`Invalid selector "${selector}":`, error);
            return null;
        }
    }

    /**
     * Query selector all with error handling
     * @param {string} selector - CSS selector
     * @param {Element} parent - Parent element (defaults to document)
     * @returns {NodeList|Array}
     */
    static queryAll(selector, parent = document) {
        try {
            return parent.querySelectorAll(selector);
        } catch (error) {
            console.error(`Invalid selector "${selector}":`, error);
            return [];
        }
    }

    /**
     * Create element with properties and children
     * @param {string} tag - HTML tag name
     * @param {Object} props - Element properties and attributes
     * @param {Array<Element|string>} children - Child elements or text
     * @returns {Element}
     */
    static createElement(tag, props = {}, children = []) {
        const el = document.createElement(tag);

        // Set properties and attributes
        Object.entries(props).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key === 'dataset' && typeof value === 'object') {
                Object.assign(el.dataset, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                el.addEventListener(key.substring(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        });

        // Add children
        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Element) {
                el.appendChild(child);
            }
        });

        return el;
    }

    /**
     * Parse HTML string into element
     * @param {string} html - HTML string
     * @returns {Element|null}
     */
    static parseHTML(html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        return template.content.firstElementChild;
    }

    /**
     * Clear all children from an element
     * @param {string} id - Element ID
     * @returns {boolean} True if successful
     */
    static clearChildren(id) {
        return this.updateElement(id, el => {
            el.innerHTML = '';
        });
    }

    /**
     * Append child to element
     * @param {string} id - Parent element ID
     * @param {Element} child - Child element to append
     * @returns {boolean} True if successful
     */
    static appendChild(id, child) {
        return this.updateElement(id, el => {
            el.appendChild(child);
        });
    }

    /**
     * Set inner HTML safely
     * @param {string} id - Element ID
     * @param {string} html - HTML string
     * @returns {boolean} True if successful
     */
    static setHTML(id, html) {
        return this.updateElement(id, el => {
            el.innerHTML = html;
        });
    }
}

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DOMHelpers;
} else if (typeof global !== 'undefined') {
    global.DOMHelpers = DOMHelpers;
}
