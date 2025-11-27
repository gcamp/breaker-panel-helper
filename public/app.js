/**
 * Breaker Panel Helper - Main Application
 * Manages electrical panel breakers with comprehensive circuit tracking
 */

/* global MoveManager */

/**
 * Main Application Class
 */
class BreakerPanelApp {
    constructor() {
        this.api = new ApiClient();
        this.currentPanel = null;
        this.allPanels = [];
        this.allRooms = [];
        this.currentBreaker = null;
        this.circuitCounter = 0;
        this.existingCircuits = [];
        this.allCircuitData = [];
        this.globalCircuitCache = new Map(); // Cache all circuits globally
        this.currentSort = { column: 'breaker', direction: 'asc' };
        
        // Initialize modules
        this.panelRenderer = new PanelRenderer(this);
        this.circuitListManager = new CircuitListManager(this);
        this.moveManager = new MoveManager(this);
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            await this.loadDefaultPanel();
        } catch (error) {
            this.handleError('Application initialization failed', error);
        }
    }

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================

    setupEventListeners() {
        // Panel management
        this.bindElement('new-panel', 'click', () => this.openNewPanelModal());
        this.bindElement('delete-panel', 'click', () => this.deleteCurrentPanel());
        this.bindElement('current-panel', 'change', (e) => this.switchPanel(parseInt(e.target.value)));
        this.bindElement('manage-rooms', 'click', () => this.openRoomManagementModal());
        
        // New panel modal
        this.bindElement('new-panel-form', 'submit', (e) => this.createNewPanel(e));
        this.bindElement('cancel-new-panel', 'click', () => this.closeNewPanelModal());
        
        // Room management modal
        this.bindElement('room-form', 'submit', (e) => this.createRoom(e));
        this.bindElement('cancel-room', 'click', () => this.closeRoomManagementModal());
        
        // Breaker management
        this.bindElement('breaker-form', 'submit', (e) => this.saveBreakerForm(e));
        this.bindElement('delete-breaker', 'click', () => this.deleteBreaker());
        this.bindElement('add-circuit', 'click', () => this.addCircuitForm());
        this.bindElement('breaker-type', 'change', (e) => this.toggleBreakerType(e));
        
        // View mode buttons
        this.bindElement('normal-mode', 'click', () => this.setViewMode('normal'));
        this.bindElement('critical-mode', 'click', () => this.setViewMode('critical'));
        this.bindElement('monitor-mode', 'click', () => this.setViewMode('monitor'));
        
        // Display mode buttons
        this.bindElement('panel-view', 'click', () => this.setDisplayMode('panel'));
        this.bindElement('circuit-list', 'click', () => this.setDisplayMode('circuit-list'));
        this.bindElement('print-panel', 'click', () => this.printPanel());
        
        // Circuit list filters
        this.bindElement('circuit-search', 'input', () => this.applyCircuitFilters());
        this.bindElement('room-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('type-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('critical-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('monitor-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('not-confirmed-filter', 'change', () => this.applyCircuitFilters());
        this.bindElement('clear-filters', 'click', () => this.clearCircuitFilters());
        
        // Global event listeners
        this.setupGlobalListeners();
    }

    bindElement(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with ID '${id}' not found`);
        }
    }

    setupGlobalListeners() {
        // Modal close events
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        });
        
        // Click outside modal to close
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
        
        // ESC key to close modals
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const openModals = document.querySelectorAll('.modal[style*="display: block"], .modal[style*="display:block"]');
                openModals.forEach(modal => {
                    modal.style.display = 'none';
                });
            }
        });

        // Sortable headers for circuit list
        document.addEventListener('click', (e) => {
            const sortableHeader = e.target.closest('.sortable');
            if (sortableHeader) {
                const column = sortableHeader.dataset.column;
                this.sortCircuitList(column);
            }
        });
    }

    // ============================================================================
    // PANEL MANAGEMENT
    // ============================================================================

    async loadDefaultPanel() {
        try {
            await Promise.all([
                this.loadAllPanels(),
                this.loadAllRooms()
            ]);
            if (this.allPanels.length > 0) {
                this.currentPanel = this.allPanels[0];
                this.renderPanel();
            } else {
                await this.createDefaultPanel();
            }
            this.updatePanelControls();
        } catch (error) {
            this.handleError('Failed to load panels', error);
            await this.createDefaultPanel();
        }
    }

    async loadAllPanels() {
        const panels = await this.api.getAllPanels();
        
        // Load complete data for all panels to populate global cache
        const panelDataPromises = panels.map(panel => 
            this.api.getPanelComplete(panel.id).catch(error => {
                console.warn(`Failed to load data for panel ${panel.id}:`, error);
                return { panel, breakers: [], circuits: [] };
            })
        );
        
        const allPanelData = await Promise.all(panelDataPromises);
        
        // Build global circuit cache and extract all circuits
        this.globalCircuitCache.clear();
        const allCircuits = [];
        
        allPanelData.forEach(({ circuits }) => {
            circuits.forEach(circuit => {
                this.globalCircuitCache.set(circuit.id, circuit);
                allCircuits.push(circuit);
            });
        });
        
        // Identify subpanels
        const subpanelIds = new Set(
            allCircuits
                .filter(circuit => circuit.type === 'subpanel' && circuit.subpanel_id)
                .map(circuit => circuit.subpanel_id)
        );
        
        // Sort: main panels first, then subpanels
        this.allPanels = panels.sort((a, b) => {
            const aIsMain = !subpanelIds.has(a.id);
            const bIsMain = !subpanelIds.has(b.id);
            
            if (aIsMain && !bIsMain) return -1;
            if (!aIsMain && bIsMain) return 1;
            return a.name.localeCompare(b.name);
        });
        
        await this.populatePanelSelector();
    }

    // Helper methods to maintain circuit cache
    updateCircuitCache(circuit) {
        this.globalCircuitCache.set(circuit.id, circuit);
    }

    removeCircuitFromCache(circuitId) {
        this.globalCircuitCache.delete(circuitId);
    }

    getCircuitsByBreaker(breakerId) {
        return Array.from(this.globalCircuitCache.values())
            .filter(c => c.breaker_id === breakerId);
    }

    async createPanelOptions(panels, circuits) {
        const subpanelIds = new Set(
            circuits
                .filter(circuit => circuit.type === 'subpanel' && circuit.subpanel_id)
                .map(circuit => circuit.subpanel_id)
        );
        
        return panels.map(panel => {
            const isMain = !subpanelIds.has(panel.id);
            const prefix = isMain ? '🏠 ' : '⚡ ';
            return {
                value: panel.id,
                text: prefix + panel.name,
                panel
            };
        });
    }

    async populatePanelSelector() {
        const selector = document.getElementById('current-panel');
        if (!selector) return;
        
        selector.innerHTML = '';
        
        // Use cached circuits instead of making API call
        const circuits = Array.from(this.globalCircuitCache.values());
        const panelOptions = await this.createPanelOptions(this.allPanels, circuits);
        
        panelOptions.forEach(({ value, text }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            selector.appendChild(option);
        });
        
        if (this.currentPanel) {
            selector.value = this.currentPanel.id;
        }
    }

    updatePanelControls() {
        const currentIndex = this.allPanels.findIndex(p => p.id === this.currentPanel?.id);
        
        this.updateElementState('prev-panel', 'disabled', currentIndex <= 0);
        this.updateElementState('next-panel', 'disabled', currentIndex >= this.allPanels.length - 1);
        this.updateElementState('delete-panel', 'disabled', this.allPanels.length <= 1);
    }

    updateElementState(id, property, value) {
        const element = document.getElementById(id);
        if (element) {
            element[property] = value;
        }
    }

    async createDefaultPanel() {
        const panelData = { name: 'Main Panel', size: 40 };
        
        try {
            this.currentPanel = await this.api.createPanel(panelData);
            this.allPanels = [this.currentPanel];
            this.renderPanel();
            this.updatePanelControls();
        } catch (error) {
            this.handleError('Failed to create default panel', error);
        }
    }

    // Panel Modal Management
    openNewPanelModal() {
        document.getElementById('panel-name').value = '';
        document.getElementById('panel-size').value = '40';
        this.showModal('new-panel-modal');
    }

    closeNewPanelModal() {
        this.hideModal('new-panel-modal');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'block';
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    async createNewPanel(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const panelData = {
            name: formData.get('name'),
            size: parseInt(formData.get('size'))
        };

        try {
            const newPanel = await this.api.createPanel(panelData);
            this.currentPanel = newPanel;
            await this.loadAllPanels();
            this.renderPanel();
            await this.populatePanelSelector();
            this.updatePanelControls();
            this.closeNewPanelModal();
        } catch (error) {
            this.handleError('Failed to create panel', error);
        }
    }

    async switchPanel(panelId) {
        const panel = this.allPanels.find(p => p.id === panelId);
        if (panel) {
            this.currentPanel = panel;
            this.renderPanel();
            this.updatePanelControls();
            
            // Update circuit list if displayed
            if (this.isCircuitListVisible()) {
                this.loadCircuitList();
            }
        }
    }

    async deleteCurrentPanel() {
        if (this.allPanels.length <= 1) {
            alert('Cannot delete the last panel. At least one panel must exist.');
            return;
        }

        const confirmDelete = confirm(`Are you sure you want to delete "${this.currentPanel.name}"? This action cannot be undone.`);
        if (!confirmDelete) return;

        try {
            await this.api.deletePanel(this.currentPanel.id);
            await this.loadAllPanels();
            
            if (this.allPanels.length > 0) {
                this.currentPanel = this.allPanels[0];
                this.renderPanel();
                await this.populatePanelSelector();
            }
            this.updatePanelControls();
        } catch (error) {
            this.handleError('Failed to delete panel', error);
        }
    }

    // ============================================================================
    // VIEW MODE MANAGEMENT
    // ============================================================================

    setViewMode(mode) {
        const panelContainer = document.querySelector('.panel-container');
        const modeButtons = document.querySelectorAll('.mode-btn');
        
        if (!panelContainer) return;
        
        // Remove all mode classes
        panelContainer.classList.remove('critical-mode', 'monitor-mode');
        
        // Remove active class from all buttons
        modeButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add the selected mode
        if (mode === 'critical') {
            panelContainer.classList.add('critical-mode');
            this.setActiveButton('critical-mode');
        } else if (mode === 'monitor') {
            panelContainer.classList.add('monitor-mode');
            this.setActiveButton('monitor-mode');
        } else {
            this.setActiveButton('normal-mode');
        }
    }

    setDisplayMode(mode) {
        const displayButtons = document.querySelectorAll('.display-btn');
        const panelContainer = document.querySelector('.panel-container');
        const circuitListContainer = document.querySelector('.circuit-list-container');
        const viewModesContainer = document.getElementById('view-modes-container');
        
        if (!panelContainer || !circuitListContainer) return;
        
        // Remove active class from all buttons
        displayButtons.forEach(btn => btn.classList.remove('active'));
        
        if (mode === 'circuit-list') {
            panelContainer.style.display = 'none';
            circuitListContainer.style.display = 'block';
            if (viewModesContainer) viewModesContainer.style.visibility = 'hidden';
            this.setActiveButton('circuit-list');
            this.loadCircuitList();
        } else {
            panelContainer.style.display = 'block';
            circuitListContainer.style.display = 'none';
            if (viewModesContainer) viewModesContainer.style.visibility = 'visible';
            this.setActiveButton('panel-view');
        }
    }

    setActiveButton(buttonId) {
        const button = document.getElementById(buttonId);
        if (button) button.classList.add('active');
    }

    isCircuitListVisible() {
        const container = document.querySelector('.circuit-list-container');
        return container && container.style.display !== 'none';
    }

    // ============================================================================
    // ERROR HANDLING
    // ============================================================================

    handleError(message, error) {
        console.error(message + ':', error);
        const userMessage = error.message || 'An unexpected error occurred';
        alert(`${message}: ${userMessage}`);
    }

    showSuccess(message) {
        console.log('Success:', message);
        alert(message);
    }

    showNotification(message) {
        console.log('Notification:', message);
        alert(message);
    }

    // ============================================================================
    // PANEL RENDERING METHODS (Delegate to PanelRenderer)
    // ============================================================================

    renderPanel() {
        this.panelRenderer.renderPanel();
    }

    async openBreakerModal(position) {
        return this.panelRenderer.openBreakerModal(position);
    }

    addCircuitForm(circuitData = null) {
        this.panelRenderer.addCircuitForm(circuitData);
    }

    toggleBreakerType(e) {
        this.panelRenderer.toggleBreakerType(e);
    }

    async saveBreakerForm(e) {
        return this.panelRenderer.saveBreakerForm(e);
    }

    async deleteBreaker() {
        if (!this.currentBreaker) return;
        
        const confirmed = confirm(
            `Are you sure you want to delete this breaker and all its circuits?\n\n` +
            `This will clear breaker position ${this.currentBreaker.position} and remove all associated circuits. This action cannot be undone.`
        );
        
        if (confirmed) {
            try {
                // Delete the breaker (this will also delete associated circuits due to foreign key constraints)
                await this.api.deleteBreaker(this.currentBreaker.id);
                
                // Close the modal
                this.closeModal();
                
                // Refresh the panel display
                this.renderPanel();
                
                // Update circuit list if displayed
                if (this.isCircuitListVisible()) {
                    this.loadCircuitList();
                }
            } catch (error) {
                this.handleError('Failed to delete breaker', error);
            }
        }
    }

    closeModal() {
        this.panelRenderer.closeModal();
    }

    // ============================================================================
    // CIRCUIT LIST METHODS (Delegate to CircuitListManager)
    // ============================================================================

    async loadCircuitList() {
        return this.circuitListManager.loadCircuitList();
    }

    applyCircuitFilters() {
        this.circuitListManager.applyCircuitFilters();
    }

    clearCircuitFilters() {
        this.circuitListManager.clearCircuitFilters();
    }

    sortCircuitList(column) {
        this.circuitListManager.sortCircuitList(column);
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    sanitizeInput(input) {
        if (typeof input === 'string') {
            return input.trim();
        }
        return input;
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================================================
    // PRINT FUNCTIONALITY
    // ============================================================================

    printPanel() {
        if (!this.currentPanel) {
            alert('No panel selected. Please select a panel to print.');
            return;
        }

        // Create a print window with the panel content
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        const panelHtml = this.generatePrintHtml();
        
        printWindow.document.write(panelHtml);
        printWindow.document.close();
        
        // Wait for content to load, then print
        printWindow.onload = () => {
            printWindow.print();
            printWindow.close();
        };
    }

    generatePrintHtml() {
        const panelElement = document.getElementById('breaker-panel');
        const panelContainer = document.querySelector('.panel-container');
        
        if (!panelElement || !panelContainer) {
            return `<html><body><p>Panel not available for printing.</p></body></html>`;
        }

        // Clone the panel element to avoid modifying the original
        const clonedPanel = panelElement.cloneNode(true);
        const clonedContainer = panelContainer.cloneNode(true);
        clonedContainer.querySelector('.breaker-panel').replaceWith(clonedPanel);

        const currentDate = new Date().toLocaleDateString();
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Electrical Panel - ${this.currentPanel.name}</title>
            <style>
                ${this.getPrintStyles()}
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1>Electrical Panel - ${this.currentPanel.name}</h1>
                <div class="print-info">
                    <span>Printed: ${currentDate}</span>
                </div>
            </div>
            
            <div class="print-panel-container">
                ${clonedContainer.innerHTML}
            </div>
        </body>
        </html>
        `;
    }

    getPrintStyles() {
        return `
            @page {
                size: letter;
                margin: 0.5in;
            }
            
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Arial', sans-serif;
                font-size: 12px;
                line-height: 1.4;
                color: #000;
                background: white;
            }
            
            .print-header {
                text-align: center;
                margin-bottom: 20px;
                border-bottom: 2px solid #333;
                padding-bottom: 10px;
            }
            
            .print-header h1 {
                font-size: 18px;
                margin-bottom: 5px;
                color: #333;
            }
            
            .print-info {
                display: flex;
                justify-content: center;
                font-size: 10px;
                color: #666;
            }
            
            .print-panel-container {
                display: flex;
                justify-content: center;
                margin-bottom: 20px;
            }
            
            .panel-container {
                background: white;
                border: none;
                box-shadow: none;
                padding: 0;
            }
            
            .breaker-panel {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 2px;
                max-width: 650px;
                width: 100%;
                margin: 0 auto;
                border: 2px solid #000;
                padding: 12px;
                background-color: #f5f5f5;
            }
            
            .breaker-container {
                display: flex;
                align-items: center;
                gap: 4px;
                min-height: 35px;
            }
            
            .breaker {
                height: 35px;
                flex: 1;
                border: 1px solid #666;
                border-radius: 3px;
                background-color: #fff;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                font-size: 9px;
                position: relative;
            }
            
            .breaker.occupied {
                background-color: #e8f5e8;
                border-color: #27ae60;
            }
            
            .breaker-container.double-pole-container {
                grid-row: span 2;
                min-height: 74px;
            }
            
            .breaker-container.double-pole-container .breaker {
                height: 74px;
            }
            
            .breaker-container.double-pole-container .breaker-amperage-box {
                height: 60px;
            }
            
            .breaker-amperage-box {
                width: 20px;
                height: 25px;
                background-color: #333;
                border-radius: 2px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 7px;
                font-weight: bold;
                color: transparent;
                writing-mode: vertical-rl;
                text-orientation: mixed;
            }
            
            .breaker-amperage-box.has-amperage {
                background-color: #222;
                color: white;
            }
            
            .breaker-amperage-box.left {
                order: -1;
            }
            
            .breaker-amperage-box.right {
                order: 1;
            }
            
            .breaker-number {
                font-size: 10px;
                font-weight: bold;
                color: #333;
                background-color: #f0f0f0;
                padding: 1px 3px;
                border-radius: 2px;
                min-width: 16px;
                text-align: center;
            }
            
            .breaker-label {
                font-size: 8px;
                font-weight: 600;
                text-align: center;
                max-width: 140px;
                color: #333;
                margin-top: 2px;
                line-height: 1.1;
                white-space: pre-line;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
            }
            
            .breaker.has-subpanel {
                border-left: 2px solid #8b5cf6;
            }
            
            .breaker.has-subpanel .breaker-label {
                color: #8b5cf6;
                font-weight: 700;
            }
            
            .breaker-indicators {
                display: none;
            }
            
            .indicator {
                display: none;
            }
            
            /* Tandem Breaker Print Styles */
            .breaker-slot {
                width: 100%;
                height: 100%;
            }
            
            .tandem-breakers {
                display: flex;
                flex-direction: column;
                height: 100%;
                gap: 1px;
            }
            
            .tandem-breakers .breaker {
                height: 50%;
                font-size: 7px;
                flex-direction: row;
                justify-content: flex-start;
                align-items: center;
                padding: 1px 2px;
                gap: 2px;
            }
            
            .tandem-breakers .breaker-number {
                font-size: 7px;
                padding: 1px 2px;
                min-width: 12px;
                flex-shrink: 0;
            }
            
            .tandem-breakers .breaker-label {
                font-size: 6px;
                line-height: 1.1;
                flex: 1;
                text-align: left;
                white-space: pre-line;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                margin-top: 0;
            }
            
            .tandem-breakers .breaker-indicators {
                display: none;
            }
            
            .breaker-container.has-tandem .single-breaker {
                display: none;
            }
            
            .breaker-container.has-tandem .tandem-breakers {
                display: flex !important;
            }
            
            .breaker-container:not(.has-tandem) .tandem-breakers {
                display: none;
            }
            
            .breaker-container:not(.has-tandem) .single-breaker {
                display: flex;
            }
            
            @media print {
                body { -webkit-print-color-adjust: exact; }
            }
        `;
    }

    // ============================================================================
    // ROOM MANAGEMENT
    // ============================================================================

    async loadAllRooms() {
        try {
            this.allRooms = await this.api.getAllRooms();
        } catch (error) {
            this.handleError('Failed to load rooms', error);
            this.allRooms = [];
        }
    }

    openRoomManagementModal() {
        this.loadRoomsList();
        this.showModal('room-management-modal');
    }

    closeRoomManagementModal() {
        this.hideModal('room-management-modal');
        document.getElementById('room-name').value = '';
        document.getElementById('room-level').value = '';
    }

    async createRoom(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const roomData = {
            name: formData.get('name'),
            level: formData.get('level')
        };

        try {
            await this.api.createRoom(roomData);
            await this.loadAllRooms();
            this.loadRoomsList();
            
            // Clear form
            document.getElementById('room-name').value = '';
            document.getElementById('room-level').value = '';
        } catch (error) {
            this.handleError('Failed to create room', error);
        }
    }

    async deleteRoom(roomId) {
        const room = this.allRooms.find(r => r.id === roomId);
        if (!room) return;

        const confirmDelete = confirm(`Are you sure you want to delete room "${room.name}"? This action cannot be undone.`);
        if (!confirmDelete) return;

        try {
            await this.api.deleteRoom(roomId);
            await this.loadAllRooms();
            this.loadRoomsList();
        } catch (error) {
            this.handleError('Failed to delete room', error);
        }
    }

    loadRoomsList() {
        const container = document.getElementById('rooms-container');
        if (!container) return;

        if (this.allRooms.length === 0) {
            container.innerHTML = `<p class="no-rooms">No rooms created yet. Add a room to get started.</p>`;
            return;
        }

        const roomsByLevel = this.allRooms.reduce((acc, room) => {
            if (!acc[room.level]) acc[room.level] = [];
            acc[room.level].push(room);
            return acc;
        }, {});

        const levelOrder = ['upper', 'main', 'basement', 'outside'];
        const levelNames = {
            basement: 'Basement',
            main: 'Main Level',
            upper: 'Upper Level',
            outside: 'Outside'
        };

        let html = '';
        levelOrder.forEach(level => {
            html += `<div class="room-level-group" data-level="${level}">
                <h4>${BreakerPanelApp.levelColors[level]} ${levelNames[level]}</h4>
                <div class="room-items drop-zone">`;
            
            if (roomsByLevel[level]) {
                roomsByLevel[level].forEach(room => {
                    html += `<div class="room-item" 
                        data-room-id="${room.id}" 
                        data-level="${level}" 
                        draggable="true">
                        <span class="room-name">${room.name}</span>
                        <button class="delete-room-btn" onclick="app.deleteRoom(${room.id})">Delete</button>
                    </div>`;
                });
            }
            
            html += `</div></div>`;
        });

        container.innerHTML = html;
        this.setupRoomDragAndDrop();
    }

    setupRoomDragAndDrop() {
        const roomItems = document.querySelectorAll('.room-item[draggable]');
        const dropZones = document.querySelectorAll('.room-items.drop-zone');
        
        // Setup drag events for room items
        roomItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.roomId);
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
        });
        
        // Setup drop events for level groups
        dropZones.forEach(zone => {
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('drag-over');
            });
            
            zone.addEventListener('dragleave', (e) => {
                if (!zone.contains(e.relatedTarget)) {
                    zone.classList.remove('drag-over');
                }
            });
            
            zone.addEventListener('drop', async (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                
                const roomId = parseInt(e.dataTransfer.getData('text/plain'));
                const targetLevel = zone.closest('.room-level-group').dataset.level;
                const draggedItem = document.querySelector(`[data-room-id="${roomId}"]`);
                const currentLevel = draggedItem.dataset.level;
                
                if (targetLevel !== currentLevel) {
                    await this.moveRoomToLevel(roomId, targetLevel);
                }
            });
        });
    }

    async moveRoomToLevel(roomId, newLevel) {
        try {
            const room = this.allRooms.find(r => r.id === roomId);
            if (!room) return;
            
            await this.api.updateRoom(roomId, {
                name: room.name,
                level: newLevel
            });
            
            await this.loadAllRooms();
            this.loadRoomsList();
        } catch (error) {
            this.handleError('Failed to move room to new level', error);
        }
    }
}

// Define level colors as static property for reuse across components
BreakerPanelApp.levelColors = {
    basement: '🔵',
    main: '🟢', 
    upper: '🟠',
    outside: '⚫'
};

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BreakerPanelApp;
} else if (typeof global !== 'undefined') {
    global.BreakerPanelApp = BreakerPanelApp;
}

// Initialize the application when DOM is ready (skip in test environment)
if (typeof module === 'undefined' || !module.exports) {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new BreakerPanelApp();
    });
}