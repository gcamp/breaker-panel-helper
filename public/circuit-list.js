/**
 * Circuit List Manager - Handles circuit list view, filtering, and sorting
 */
class CircuitListManager {
    constructor(app) {
        this.app = app;
    }

    async loadCircuitList() {
        if (!this.app.currentPanel) return;
        
        try {
            // Use comprehensive endpoint to get all data in one request
            const panelData = await this.app.api.getPanelComplete(this.app.currentPanel.id);
            const { breakers, circuits: panelCircuits } = panelData;
            
            // Store circuit data for filtering
            this.app.allCircuitData = panelCircuits.map(circuit => {
                const breaker = breakers.find(b => b.id === circuit.breaker_id);
                return { circuit, breaker };
            });
            
            this.sortCircuitData();
            this.updateCircuitListHeader();
            this.populateRoomFilter();
            this.resetSortHeaders();
            this.applyCircuitFilters();
            
        } catch (error) {
            this.app.handleError('Failed to load circuit list', error);
            this.app.allCircuitData = [];
            this.displayFilteredCircuits([]);
        }
    }

    updateCircuitListHeader() {
        const panelNameElement = document.getElementById('circuit-list-panel-name');
        const totalCircuitsElement = document.getElementById('total-circuits');
        
        if (panelNameElement) {
            panelNameElement.textContent = this.app.currentPanel.name;
        }
        if (totalCircuitsElement) {
            totalCircuitsElement.textContent = this.app.allCircuitData.length;
        }
    }

    populateRoomFilter() {
        const roomFilter = document.getElementById('room-filter');
        if (!roomFilter) return;
        
        const rooms = [...new Set(this.app.allCircuitData
            .map(item => item.circuit.room)
            .filter(room => room && room.trim() !== '')
        )].sort();
        
        roomFilter.innerHTML = `<option value="">All Rooms</option>`;
        
        rooms.forEach(room => {
            const option = document.createElement('option');
            option.value = room;
            option.textContent = room;
            roomFilter.appendChild(option);
        });
    }

    applyCircuitFilters() {
        if (!this.app.allCircuitData || this.app.allCircuitData.length === 0) {
            this.displayFilteredCircuits([]);
            return;
        }
        
        const filters = this.getFilterValues();
        const filteredData = this.filterCircuitData(filters);
        this.displayFilteredCircuits(filteredData);
    }

    getFilterValues() {
        return {
            searchTerm: this.getElementValue('circuit-search', '').toLowerCase(),
            room: this.getElementValue('room-filter', ''),
            type: this.getElementValue('type-filter', ''),
            critical: this.getElementChecked('critical-filter'),
            monitor: this.getElementChecked('monitor-filter'),
            notConfirmed: this.getElementChecked('not-confirmed-filter')
        };
    }

    getElementValue(id, defaultValue = '') {
        const element = document.getElementById(id);
        return element ? element.value : defaultValue;
    }

    getElementChecked(id) {
        const element = document.getElementById(id);
        return element ? element.checked : false;
    }

    filterCircuitData(filters) {
        return this.app.allCircuitData.filter(({ circuit, breaker }) => {
            // Text search
            if (filters.searchTerm) {
                const searchableText = [
                    breaker.label || '',
                    circuit.room || '',
                    circuit.notes || '',
                    circuit.type || '',
                    breaker.position.toString()
                ].join(' ').toLowerCase();
                
                if (!searchableText.includes(filters.searchTerm)) {
                    return false;
                }
            }
            
            // Room filter
            if (filters.room && circuit.room !== filters.room) {
                return false;
            }
            
            // Type filter
            if (filters.type && circuit.type !== filters.type) {
                return false;
            }
            
            // Flag filters
            if (filters.critical && !breaker.critical) {
                return false;
            }
            
            if (filters.monitor && !breaker.monitor) {
                return false;
            }
            
            if (filters.notConfirmed && breaker.confirmed) {
                return false;
            }
            
            return true;
        });
    }

    displayFilteredCircuits(filteredData) {
        const tableBody = document.getElementById('circuit-table-body');
        const filteredCount = document.getElementById('filtered-circuits');
        
        if (!tableBody) return;
        
        if (filteredCount) {
            filteredCount.textContent = filteredData.length;
        }
        
        tableBody.innerHTML = '';
        
        if (filteredData.length === 0) {
            this.showNoCircuitsMessage(tableBody);
            return;
        }
        
        filteredData.forEach(({ circuit, breaker }) => {
            const row = this.createCircuitRow(circuit, breaker);
            tableBody.appendChild(row);
        });
        
        this.bindCircuitRowEvents(tableBody);
    }

    showNoCircuitsMessage(tableBody) {
        const message = this.app.allCircuitData.length === 0 
            ? 'No circuits found in this panel.'
            : 'No circuits match the current filters.';
        
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="no-circuits-message">
                    ${message}
                </td>
            </tr>
        `;
    }

    createCircuitRow(circuit, breaker) {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.dataset.breakerId = breaker.id;
        row.dataset.circuitId = circuit.id;
        row.dataset.breakerPosition = breaker.position;
        row.title = 'Click to edit circuit details';
        
        // Breaker number with double pole and tandem indicators
        var breakerNumberHtml;
        if (breaker.breaker_type === 'double_pole') {
            breakerNumberHtml = `${breaker.position}-${breaker.position + 2}<span class="double-pole-indicator">2P</span>`;
        } else if (breaker.breaker_type === 'tandem') {
            const slotLetter = breaker.slot_position === 'A' ? 'A' : 'B';
            breakerNumberHtml = `${breaker.position}${slotLetter}<span class="tandem-indicator">T</span>`;
        } else {
            breakerNumberHtml = breaker.position;
        }
        if (breaker.label) {
            breakerNumberHtml += `<span class="breaker-label"> — ${breaker.label}</span>`;
        }
        
        // Circuit type with colored pill
        const circuitTypeHtml = circuit.type 
            ? `<span class="circuit-type-pill circuit-type-${circuit.type}">${circuit.type}</span>`
            : '<span class="circuit-type-pill no-type">-</span>';
        
        // Room with level color emoji
        const roomHtml = circuit.room 
            ? `${BreakerPanelApp.levelColors[circuit.room_level] || ''} ${circuit.room}`.trim()
            : '-';
        
        // Flags
        const flags = [];
        if (breaker.critical) flags.push(`<span class="flag-badge flag-critical">Critical</span>`);
        if (breaker.monitor) flags.push(`<span class="flag-badge flag-monitor">Monitor</span>`);
        if (breaker.confirmed) flags.push(`<span class="flag-badge flag-confirmed">Confirmed</span>`);
        const flagsHtml = flags.length > 0 ? `<div class="flags-cell">${flags.join('')}</div>` : '';
        
        row.innerHTML = `
            <td class="breaker-number-cell" data-label="Breaker #">${breakerNumberHtml}</td>
            <td class="amperage-cell" data-label="Amps">${breaker.amperage ? breaker.amperage + 'A' : '-'}</td>
            <td data-label="Room">${roomHtml}</td>
            <td data-label="Type">${circuitTypeHtml}</td>
            <td data-label="Notes">${circuit.notes || '-'}</td>
            <td data-label="Flags">${flagsHtml}</td>
        `;
        
        return row;
    }

    bindCircuitRowEvents(tableBody) {
        // Handle circuit row clicks to open breaker modal
        tableBody.querySelectorAll('tr[data-circuit-id]').forEach(row => {
            row.addEventListener('click', async (e) => {
                // Don't trigger if clicking on a link or button
                if (e.target.closest('a, button')) return;
                
                const breakerPosition = parseInt(row.dataset.breakerPosition);
                const circuitId = parseInt(row.dataset.circuitId);
                
                // Open breaker modal without changing display mode
                await this.app.openBreakerModal(breakerPosition);
                
                // Scroll to the specific circuit after modal opens
                setTimeout(() => {
                    this.scrollToCircuit(circuitId);
                }, 100);
            });
        });
        
        // Handle linked panel navigation
        tableBody.querySelectorAll('.linked-panel-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const panelId = parseInt(e.target.dataset.panelId);
                this.app.setDisplayMode('panel');
                this.app.switchPanel(panelId);
            });
        });
    }
    
    scrollToCircuit(circuitId) {
        // Look for the circuit element within the modal
        const modal = document.getElementById('breaker-modal');
        if (!modal) return;
        
        const circuitElement = modal.querySelector(`[data-circuit-id="${circuitId}"]`);
        if (circuitElement) {
            // Get the modal content container for scrolling
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                // Calculate the position of the circuit element relative to the modal
                const circuitRect = circuitElement.getBoundingClientRect();
                const modalRect = modalContent.getBoundingClientRect();
                const scrollTop = modalContent.scrollTop;
                
                // Calculate the target scroll position to center the circuit
                const targetScroll = scrollTop + (circuitRect.top - modalRect.top) - (modalContent.clientHeight / 2) + (circuitElement.offsetHeight / 2);
                
                // Smooth scroll within the modal
                modalContent.scrollTo({
                    top: Math.max(0, targetScroll),
                    behavior: 'smooth'
                });
            }
            
            // Add a subtle highlight effect using CSS variable
            const highlightColor = getComputedStyle(document.documentElement).getPropertyValue('--table-row-highlight').trim();
            circuitElement.style.backgroundColor = highlightColor;
            circuitElement.style.transition = 'background-color 0.3s ease';
            
            setTimeout(() => {
                circuitElement.style.backgroundColor = '';
            }, 2000);
        }
    }

    clearCircuitFilters() {
        this.setElementValue('circuit-search', '');
        this.setElementValue('room-filter', '');
        this.setElementValue('type-filter', '');
        this.setElementChecked('critical-filter', false);
        this.setElementChecked('monitor-filter', false);
        this.setElementChecked('not-confirmed-filter', false);
        
        this.resetSortHeaders();
        this.sortCircuitData();
        this.applyCircuitFilters();
    }

    setElementValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.value = value;
    }

    setElementChecked(id, checked) {
        const element = document.getElementById(id);
        if (element) element.checked = checked;
    }

    // ============================================================================
    // SORTING FUNCTIONALITY
    // ============================================================================

    sortCircuitList(column) {
        // Toggle direction if same column, otherwise set to ascending
        if (this.app.currentSort.column === column) {
            this.app.currentSort.direction = this.app.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.app.currentSort.column = column;
            this.app.currentSort.direction = 'asc';
        }
        
        this.updateSortHeaders();
        this.sortCircuitData();
        this.applyCircuitFilters();
    }

    updateSortHeaders() {
        // Remove active classes from all headers
        document.querySelectorAll('.sortable').forEach(header => {
            header.classList.remove('active', 'asc', 'desc');
        });
        
        // Add active class to current sort column
        const activeHeader = document.querySelector(`[data-column="${this.app.currentSort.column}"]`);
        if (activeHeader) {
            activeHeader.classList.add('active', this.app.currentSort.direction);
        }
    }

    resetSortHeaders() {
        this.app.currentSort = { column: 'breaker', direction: 'asc' };
        this.updateSortHeaders();
    }

    sortCircuitData() {
        this.app.allCircuitData.sort((a, b) => {
            const { column, direction } = this.app.currentSort;
            const [valueA, valueB] = this.getSortValues(a, b, column);
            
            let comparison = 0;
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                comparison = valueA - valueB;
            } else {
                comparison = valueA.toString().localeCompare(valueB.toString());
            }
            
            return direction === 'asc' ? comparison : -comparison;
        });
    }

    getSortValues(a, b, column) {
        let valueA, valueB;
        
        switch (column) {
            case 'breaker':
                valueA = a.breaker.position;
                valueB = b.breaker.position;
                break;
            case 'label':
                valueA = (a.breaker.label || '').toLowerCase();
                valueB = (b.breaker.label || '').toLowerCase();
                break;
            case 'amperage':
                valueA = a.breaker.amperage || 0;
                valueB = b.breaker.amperage || 0;
                break;
            case 'room':
                valueA = (a.circuit.room || '').toLowerCase();
                valueB = (b.circuit.room || '').toLowerCase();
                break;
            case 'type':
                valueA = (a.circuit.type || '').toLowerCase();
                valueB = (b.circuit.type || '').toLowerCase();
                break;
            case 'notes':
                valueA = (a.circuit.notes || '').toLowerCase();
                valueB = (b.circuit.notes || '').toLowerCase();
                break;
            case 'flags': {
                // Sort by number of flags, then by type
                const flagsA = (a.breaker.critical ? 2 : 0) + (a.breaker.monitor ? 1 : 0);
                const flagsB = (b.breaker.critical ? 2 : 0) + (b.breaker.monitor ? 1 : 0);
                valueA = flagsA;
                valueB = flagsB;
                break;
            }
            case 'linked':
                valueA = this.getLinkedPanelName(a.circuit);
                valueB = this.getLinkedPanelName(b.circuit);
                break;
            default:
                valueA = valueB = '';
        }
        
        return [valueA, valueB];
    }

    getLinkedPanelName(circuit) {
        if (circuit.type === 'subpanel' && circuit.subpanel_id) {
            const panel = this.app.allPanels.find(p => p.id === circuit.subpanel_id);
            return panel ? panel.name.toLowerCase() : '';
        }
        return '';
    }
}

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CircuitListManager;
} else if (typeof global !== 'undefined') {
    global.CircuitListManager = CircuitListManager;
}
