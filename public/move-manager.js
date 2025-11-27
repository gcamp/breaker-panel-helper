/**
 * Move Manager - Handles breaker move operations
 */
class MoveManager {
    constructor(app) {
        this.app = app;
        this.sourceBreaker = null;
        this.sourcePosition = null;
        this.sourceSlot = null;
        this.destinationPanel = null;
        this.destinationPosition = null;
        this.destinationSlot = null;
        
        // Create a dedicated PanelRenderer instance for destination panel
        this.destinationRenderer = new PanelRenderer(app);
        this.destinationRenderer.panelElementId = 'destination-breaker-panel';
        this.destinationRenderer.handleDestinationClick = (position, slot) => {
            this.selectDestination(position, slot);
        };
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Move button in breaker edit modal
        document.getElementById('move-breaker').addEventListener('click', () => {
            this.openMoveModal();
        });

        // Destination panel selector
        document.getElementById('destination-panel').addEventListener('change', (e) => {
            this.loadDestinationPanel(e.target.value);
        });


        // Move action buttons
        document.getElementById('confirm-move').addEventListener('click', () => {
            this.executeMove();
        });

        document.getElementById('cancel-move').addEventListener('click', () => {
            this.cancelMove();
        });

        // Modal close handling
        document.querySelector('#move-breaker-modal .close').addEventListener('click', () => {
            this.closeMoveModal();
        });
    }

    async openMoveModal() {
        if (!this.app.currentBreaker) {
            this.app.handleError('No breaker selected to move');
            return;
        }

        // Store source breaker information
        this.sourceBreaker = { ...this.app.currentBreaker };
        this.sourcePosition = this.sourceBreaker.position;
        this.sourceSlot = this.sourceBreaker.slot_position || 'single';
        
        // Close the breaker edit modal
        this.app.closeModal();
        
        // Populate destination panel selector
        await this.loadPanelOptions();
        
        
        // Hide preview section
        document.querySelector('.move-preview').style.display = 'none';
        
        // Show move modal
        this.app.showModal('move-breaker-modal');
    }

    async loadPanelOptions() {
        try {
            // Use cached data instead of making API calls
            const panels = this.app.allPanels;
            const circuits = Array.from(this.app.globalCircuitCache.values());
            const destinationSelect = document.getElementById('destination-panel');
            
            destinationSelect.innerHTML = '<option value="">Select destination panel...</option>';
            
            const panelOptions = await this.app.createPanelOptions(panels, circuits);
            panelOptions.forEach(({ value, text }) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = text;
                destinationSelect.appendChild(option);
            });
            
            // Default to current panel if it exists
            if (this.app.currentPanel) {
                destinationSelect.value = this.app.currentPanel.id;
                await this.loadDestinationPanel(this.app.currentPanel.id);
            }
        } catch (error) {
            this.app.handleError('Failed to load panel options', error);
        }
    }

    async loadDestinationPanel(panelId) {
        if (!panelId || panelId === '') {
            document.getElementById('destination-breaker-panel').innerHTML = '';
            return;
        }

        try {
            // Convert to integer if it's a string
            const panelIdInt = parseInt(panelId);
            if (isNaN(panelIdInt)) {
                this.app.handleError('Invalid panel ID');
                return;
            }

            // Get panel data
            this.destinationPanel = await this.app.api.getPanel(panelIdInt);
            
            // Render destination panel
            await this.renderDestinationPanel();
        } catch (error) {
            this.app.handleError('Failed to load destination panel', error);
        }
    }

    async renderDestinationPanel() {
        if (!this.destinationPanel) return;
        
        // Set the destination renderer to work with destination panel
        this.destinationRenderer.app.currentPanel = this.destinationPanel;
        
        // Use PanelRenderer's renderPanel method which will create containers and load breakers
        this.destinationRenderer.renderPanel();
    }


    selectDestination(position, slot) {
        // Clear previous selection
        document.querySelectorAll('.destination-breaker').forEach(breaker => {
            breaker.classList.remove('selected-destination');
        });

        // Mark new selection
        const selectedBreaker = document.querySelector(`[data-position="${position}"][data-slot="${slot}"]`);
        if (selectedBreaker) {
            selectedBreaker.classList.add('selected-destination');
        }

        this.destinationPosition = position;
        this.destinationSlot = slot;

        // Generate and show preview
        this.generateMovePreview();
    }

    async generateMovePreview() {
        if (!this.destinationPosition) return;

        try {
            // Get destination breaker if it exists
            const destinationBreakers = await this.app.api.getBreakersByPanel(this.destinationPanel.id);
            const destinationBreaker = destinationBreakers.find(b => 
                b.position === this.destinationPosition && 
                (b.slot_position || 'single') === this.destinationSlot
            );

            // Get source circuits from cache
            const sourceCircuits = Array.from(this.app.globalCircuitCache.values())
                .filter(c => c.breaker_id === this.sourceBreaker.id);
            const relevantSourceCircuits = sourceCircuits.filter(c => 
                (c.slot_position || 'single') === this.sourceSlot
            );

            // Get destination circuits if breaker exists
            let destinationCircuits = [];
            if (destinationBreaker) {
                const allDestinationCircuits = Array.from(this.app.globalCircuitCache.values())
                    .filter(c => c.breaker_id === destinationBreaker.id);
                destinationCircuits = allDestinationCircuits.filter(c => 
                    (c.slot_position || 'single') === this.destinationSlot
                );
            }

            // Generate preview text
            const previewText = this.buildPreviewText(
                relevantSourceCircuits,
                destinationCircuits,
                destinationBreaker
            );

            // Show preview
            document.getElementById('move-preview-content').innerHTML = previewText;
            document.querySelector('.move-preview').style.display = 'block';

        } catch (error) {
            this.app.handleError('Failed to generate move preview', error);
        }
    }

    buildPreviewText(sourceCircuits, destinationCircuits, destinationBreaker) {
        const sourcePanelName = this.app.currentPanel.name;
        const destPanelName = this.destinationPanel.name;
        const sourcePos = `${this.sourcePosition}${this.sourceSlot !== 'single' ? this.sourceSlot : ''}`;
        const destPos = `${this.destinationPosition}${this.destinationSlot !== 'single' ? this.destinationSlot : ''}`;

        let preview = `<div class="preview-section">`;
        
        // Move type
        preview += `<p><strong>Move:</strong> Moving electrical connections (hot wires)</p>`;

        // Source information
        preview += `<p><strong>From:</strong> ${sourcePanelName} - Position ${sourcePos}</p>`;
        if (sourceCircuits.length > 0) {
            preview += `<ul>`;
            sourceCircuits.forEach(circuit => {
                const roomName = this.getRoomName(circuit.room_id);
                const circuitType = circuit.type || circuit.circuit_type || 'Unknown';
                preview += `<li>${roomName} - ${circuitType} - ${circuit.notes || 'No notes'}</li>`;
            });
            preview += `</ul>`;
        } else {
            preview += `<p><em>No circuits to move</em></p>`;
        }

        // Destination information
        preview += `<p><strong>To:</strong> ${destPanelName} - Position ${destPos}</p>`;

        if (destinationBreaker && destinationCircuits.length > 0) {
            // There's a swap happening
            preview += `<p><strong>⚠️ Swap Operation:</strong> Destination position is occupied</p>`;
            preview += `<p>The following circuits will move to position ${sourcePos}:</p>`;
            preview += `<ul>`;
            destinationCircuits.forEach(circuit => {
                const roomName = this.getRoomName(circuit.room_id);
                const circuitType = circuit.type || circuit.circuit_type || 'Unknown';
                preview += `<li>${roomName} - ${circuitType} - ${circuit.notes || 'No notes'}</li>`;
            });
            preview += `</ul>`;
        } else if (destinationBreaker) {
            preview += `<p><em>Destination position has empty breaker</em></p>`;
        } else {
            preview += `<p><em>Destination position is empty</em></p>`;
        }

        preview += `</div>`;
        return preview;
    }

    async executeMove() {
        if (!this.destinationPosition) {
            this.app.handleError('Please select a destination position');
            return;
        }

        try {
            const moveData = {
                sourceBreakerId: this.sourceBreaker.id,
                sourcePanelId: this.app.currentPanel.id,
                sourcePosition: this.sourcePosition,
                sourceSlot: this.sourceSlot,
                destinationPanelId: this.destinationPanel.id,
                destinationPosition: this.destinationPosition,
                destinationSlot: this.destinationSlot
            };

            await this.app.api.moveBreaker(moveData);
            
            // Success - close modal and refresh
            this.closeMoveModal();
            // Clear any current breaker selection to prevent modal reopening
            this.app.currentBreaker = null;
            this.app.renderPanel();
            
            if (this.app.isCircuitListVisible()) {
                this.app.loadCircuitList();
            }

            this.app.showNotification('Breaker moved successfully');

        } catch (error) {
            this.app.handleError('Failed to move breaker', error);
        }
    }

    cancelMove() {
        this.closeMoveModal();
        // Reopen the original breaker edit modal
        if (this.sourceBreaker) {
            this.app.currentBreaker = this.sourceBreaker;
            this.app.showModal('breaker-modal');
        }
    }

    closeMoveModal() {
        this.app.hideModal('move-breaker-modal');
        this.resetMoveState();
    }

    resetMoveState() {
        this.sourceBreaker = null;
        this.sourcePosition = null;
        this.sourceSlot = null;
        this.destinationPanel = null;
        this.destinationPosition = null;
        this.destinationSlot = null;
        
        // Clear UI selections
        document.querySelectorAll('.destination-breaker').forEach(breaker => {
            breaker.classList.remove('selected-destination');
        });
        
        document.querySelector('.move-preview').style.display = 'none';
    }

    getRoomName(roomId) {
        if (!roomId) return 'No Room';
        const room = this.app.allRooms?.find(r => r.id === roomId);
        return room ? room.name : `Room ${roomId}`;
    }

}

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoveManager;
} else if (typeof global !== 'undefined') {
    global.MoveManager = MoveManager;
}