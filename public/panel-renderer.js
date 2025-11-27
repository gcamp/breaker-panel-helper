/**
 * Panel Renderer - Handles visual panel rendering and breaker management
 */
class PanelRenderer {
    constructor(app) {
        this.app = app;
        this.panelElementId = 'breaker-panel'; // Default to main panel
        this.breakerCache = new Map(); // Cache breakers by position for quick lookup
        this.circuitCache = new Map(); // Cache circuits by breaker_id
    }

    renderPanel() {
        const panelElement = document.getElementById(this.panelElementId);
        if (!panelElement || !this.app.currentPanel) return;
        
        panelElement.innerHTML = '';
        const size = this.app.currentPanel.size;
        
        for (let i = 1; i <= size; i++) {
            const isDestination = this.panelElementId === 'destination-breaker-panel';
            const breakerContainer = this.createBreakerContainer(i, isDestination);
            panelElement.appendChild(breakerContainer);
        }
        
        this.loadBreakers();
    }

    createBreakerContainer(position, isDestination = false) {
        const breakerContainer = document.createElement('div');
        breakerContainer.className = isDestination ? 'breaker-container destination-container' : 'breaker-container';
        breakerContainer.dataset.position = position;
        
        const isLeft = position % 2 === 1;
        const breakerClass = isDestination ? 'destination-breaker' : '';
        
        breakerContainer.innerHTML = `
            ${isLeft ? '<div class="breaker-amperage-box left"></div>' : ''}
            <div class="breaker-slot" data-position="${position}">
                <div class="breaker single-breaker ${breakerClass}" data-position="${position}" data-slot="single">
                    <div class="breaker-number">${position}</div>
                    <div class="breaker-label"></div>
                    <div class="breaker-indicators"></div>
                </div>
                <div class="tandem-breakers" style="display: none;">
                    <div class="breaker tandem-a ${breakerClass}" data-position="${position}" data-slot="A">
                        <div class="breaker-number">${position}A</div>
                        <div class="breaker-label"></div>
                        <div class="breaker-indicators"></div>
                    </div>
                    <div class="breaker tandem-b ${breakerClass}" data-position="${position}" data-slot="B">
                        <div class="breaker-number">${position}B</div>
                        <div class="breaker-label"></div>
                        <div class="breaker-indicators"></div>
                    </div>
                </div>
            </div>
            ${!isLeft ? '<div class="breaker-amperage-box right"></div>' : ''}
        `;
        
        // Add event listeners for all breaker types
        breakerContainer.querySelectorAll('.breaker').forEach(breaker => {
            breaker.addEventListener('click', () => {
                const slot = breaker.dataset.slot;
                if (isDestination) {
                    // For destination breakers, trigger destination selection
                    const position = parseInt(breaker.dataset.position);
                    this.handleDestinationClick?.(position, slot);
                } else {
                    // For main panel breakers, open modal
                    this.openBreakerModal(position, slot);
                }
            });
        });
        
        return breakerContainer;
    }

    async loadBreakers() {
        if (!this.app.currentPanel) return;
        
        try {
            // Use the comprehensive endpoint to get all data in one request
            const panelData = await this.app.api.getPanelComplete(this.app.currentPanel.id);
            const { breakers, circuits } = panelData;
            
            // Clear and populate caches
            this.breakerCache.clear();
            this.circuitCache.clear();
            
            // Cache breakers by position (handling tandems)
            breakers.forEach(breaker => {
                const key = `${breaker.position}-${breaker.slot_position || 'single'}`;
                this.breakerCache.set(key, breaker);
            });
            
            // Cache circuits by breaker_id
            circuits.forEach(circuit => {
                if (!this.circuitCache.has(circuit.breaker_id)) {
                    this.circuitCache.set(circuit.breaker_id, []);
                }
                this.circuitCache.get(circuit.breaker_id).push(circuit);
            });
            
            // Group breakers by position to handle tandems properly
            const breakersByPosition = {};
            breakers.forEach(breaker => {
                if (!breakersByPosition[breaker.position]) {
                    breakersByPosition[breaker.position] = [];
                }
                breakersByPosition[breaker.position].push(breaker);
            });
            
            // Update display for each position
            for (const [position, positionBreakers] of Object.entries(breakersByPosition)) {
                await this.updatePositionDisplay(parseInt(position), positionBreakers);
            }
        } catch (error) {
            this.app.handleError('Failed to load breakers', error);
        }
    }

    // Update cache after breaker modifications
    updateBreakerCache(breaker) {
        const key = `${breaker.position}-${breaker.slot_position || 'single'}`;
        this.breakerCache.set(key, breaker);
    }

    // Remove from cache after breaker deletion
    removeBreakerFromCache(position, slot = 'single') {
        const key = `${position}-${slot}`;
        this.breakerCache.delete(key);
    }

    async updatePositionDisplay(position, breakers) {
        // Search within the correct panel container
        const panelContainer = document.getElementById(this.panelElementId);
        if (!panelContainer) return;
        
        const element = panelContainer.querySelector(`[data-position="${position}"]`);
        if (!element) return;
        
        const container = element.closest('.breaker-container');
        if (!container) return;

        // Reset container state
        container.classList.remove('has-tandem');
        container.querySelectorAll('.breaker').forEach(elem => {
            elem.classList.remove('occupied');
            elem.querySelector('.breaker-label').textContent = '';
            elem.querySelector('.breaker-indicators').innerHTML = '';
        });

        // Check if we have tandem breakers at this position
        const hasTandem = breakers.some(b => b.tandem || b.breaker_type === 'tandem');
        
        if (hasTandem) {
            container.classList.add('has-tandem');
            for (const breaker of breakers) {
                const breakerElement = container.querySelector(`[data-slot="${breaker.slot_position}"]`);
                if (breakerElement) {
                    breakerElement.classList.add('occupied');
                    await this.updateBreakerContent(breakerElement, breaker);
                }
            }
        } else {
            // Single breaker at this position
            const breaker = breakers[0];
            const breakerElement = container.querySelector('.single-breaker');
            if (breakerElement) {
                breakerElement.classList.add('occupied');
                await this.updateBreakerContent(breakerElement, breaker);
            }
        }
    }

    async updateBreakerDisplay(breaker) {
        // This method is now mainly used for individual updates
        // Most loading is handled by updatePositionDisplay
        const element = document.querySelector(`[data-position="${breaker.position}"]`);
        if (!element) return;
        
        const container = element.closest('.breaker-container');
        if (!container) return;

        const isTandem = breaker.tandem || breaker.breaker_type === 'tandem';
        if (isTandem) {
            container.classList.add('has-tandem');
            const breakerElement = container.querySelector(`[data-slot="${breaker.slot_position}"]`);
            if (breakerElement) {
                breakerElement.classList.add('occupied');
                await this.updateBreakerContent(breakerElement, breaker);
            }
        } else {
            // For single breakers, check if there are any tandem breakers at this position
            const allBreakersAtPosition = await this.app.api.getBreakersByPanel(this.app.currentPanel.id);
            const positionBreakers = allBreakersAtPosition.filter(b => b.position === breaker.position);
            const hasTandem = positionBreakers.some(b => b.tandem || b.breaker_type === 'tandem');
            
            if (!hasTandem) {
                container.classList.remove('has-tandem');
                const breakerElement = container.querySelector('.single-breaker');
                if (breakerElement) {
                    breakerElement.classList.add('occupied');
                    await this.updateBreakerContent(breakerElement, breaker);
                }
            }
        }
    }

    async updateBreakerContent(breakerElement, breaker) {
        // Handle flags
        this.updateBreakerFlags(breakerElement, breaker);
        
        // Handle double pole (only for non-tandem breakers)
        const isTandem = breaker.tandem || breaker.breaker_type === 'tandem';
        if (!isTandem) {
            this.updateDoublePoleDisplay(breakerElement, breaker);
        }
        
        // Update label with subpanel info
        const displayLabel = await this.getBreakerDisplayLabel(breaker);
        breakerElement.querySelector('.breaker-label').textContent = displayLabel;
        
        // Update amperage display
        this.updateAmperageDisplay(breakerElement, breaker);
        
        // Update indicators
        this.updateIndicators(breakerElement, breaker);
    }

    updateBreakerFlags(breakerElement, breaker) {
        const container = breakerElement.closest('.breaker-container');
        
        // For tandem breakers, only apply flags to individual breaker elements
        // For single breakers, apply to both container and element for backward compatibility
        const isTandem = container.classList.contains('has-tandem');
        
        if (!isTandem) {
            // Single breaker - apply to container for CSS targeting
            container.classList.toggle('critical', breaker.critical);
            container.classList.toggle('monitor', breaker.monitor);
            container.classList.toggle('confirmed', breaker.confirmed);
        }
        
        // Always apply to individual breaker element
        breakerElement.classList.toggle('critical', breaker.critical);
        breakerElement.classList.toggle('monitor', breaker.monitor);
        breakerElement.classList.toggle('confirmed', breaker.confirmed);
    }

    updateDoublePoleDisplay(breakerElement, breaker) {
        const container = breakerElement.closest('.breaker-container');
        const isDoublePole = breaker.double_pole || breaker.breaker_type === 'double_pole';
        
        // Determine the panel container based on the renderer's target element
        const panelContainer = container.closest(`#${this.panelElementId}`);
        
        if (isDoublePole) {
            breakerElement.classList.add('double-pole');
            container.classList.add('double-pole-container');
            
            // Hide the breaker below - search within the correct panel
            const targetPosition = breaker.position + 2;
            
            const belowElement = panelContainer ? 
                panelContainer.querySelector(`[data-position="${targetPosition}"]`) : null;

            
            const belowContainer = belowElement?.closest('.breaker-container');
            
            if (belowContainer) {
                belowContainer.style.setProperty('display', 'none', 'important');
            }
            
            // Update breaker number to show range
            const numberElement = breakerElement.querySelector('.breaker-number');
            numberElement.textContent = `${breaker.position}-${breaker.position + 2}`;
        } else {
            // Remove double pole styling
            breakerElement.classList.remove('double-pole');
            container.classList.remove('double-pole-container');
            
            // Restore hidden breaker - search within the correct panel
            const targetPosition = breaker.position + 2;
            const belowElement = panelContainer ? 
                panelContainer.querySelector(`[data-position="${targetPosition}"]`) : null;
            const belowContainer = belowElement?.closest('.breaker-container');
            
            if (belowContainer) {
                belowContainer.style.removeProperty('display');
            }
            
            // Reset breaker number
            const numberElement = breakerElement.querySelector('.breaker-number');
            numberElement.textContent = breaker.position;
        }
    }

    async getBreakerDisplayLabel(breaker) {
        let displayLabel = breaker.label || '';
        
        try {
            // Use cached circuit data instead of making API call
            const circuits = this.circuitCache.get(breaker.id) || [];
            
            // If no manual label is set, auto-generate one from circuits
            if (!displayLabel && circuits.length > 0) {
                displayLabel = this.generateAutoLabel(circuits);
            }
            
            const subpanelCircuit = circuits.find(circuit => 
                circuit.type === 'subpanel' && circuit.subpanel_id
            );
            
            const isDoublePole = breaker.double_pole || breaker.breaker_type === 'double_pole';
            if (subpanelCircuit && isDoublePole) {
                const linkedPanel = this.app.allPanels.find(panel => 
                    panel.id === subpanelCircuit.subpanel_id
                );
                if (linkedPanel) {
                    // Put subpanel link on second line for double pole breakers only
                    displayLabel = displayLabel 
                        ? `${displayLabel}\n→ ${linkedPanel.name}` 
                        : `→ ${linkedPanel.name}`;
                    const breakerElement = document.querySelector(`[data-position="${breaker.position}"]`);
                    if (breakerElement) breakerElement.classList.add('has-subpanel');
                }
            } else {
                const breakerElement = document.querySelector(`[data-position="${breaker.position}"]`);
                if (breakerElement) breakerElement.classList.remove('has-subpanel');
            }
        } catch (error) {
            console.error('Error loading circuits for breaker:', error);
        }
        
        return displayLabel;
    }

    generateAutoLabel(circuits) {
        // Group circuits by type
        const circuitsByType = circuits.reduce((acc, circuit) => {
            const type = circuit.type || 'other';
            if (!acc[type]) acc[type] = [];
            acc[type].push(circuit);
            return acc;
        }, {});

        const labelParts = [];

        // Handle appliances first (use notes as main value)
        if (circuitsByType.appliance) {
            circuitsByType.appliance.forEach(circuit => {
                if (circuit.notes && circuit.notes.trim()) {
                    labelParts.push(circuit.notes.trim());
                } else if (circuit.room && circuit.room.trim()) {
                    labelParts.push(`${circuit.room} appliance`);
                } else {
                    labelParts.push('Appliance');
                }
            });
        }

        // Handle heating (use notes or type + room)
        if (circuitsByType.heating) {
            circuitsByType.heating.forEach(circuit => {
                if (circuit.notes && circuit.notes.trim()) {
                    labelParts.push(circuit.notes.trim());
                } else if (circuit.room && circuit.room.trim()) {
                    labelParts.push(`${circuit.room} heating`);
                } else {
                    labelParts.push('Heating');
                }
            });
        }

        // Handle subpanels
        if (circuitsByType.subpanel) {
            circuitsByType.subpanel.forEach(circuit => {
                if (circuit.notes && circuit.notes.trim()) {
                    labelParts.push(circuit.notes.trim());
                } else {
                    labelParts.push('Subpanel');
                }
            });
        }

        // Handle outlets and lighting with smart merging
        const typeGroups = {};
        
        // Group outlets and lighting by type, collecting all rooms
        ['outlet', 'lighting'].forEach(type => {
            if (circuitsByType[type]) {
                const rooms = circuitsByType[type].map(circuit => 
                    circuit.room && circuit.room.trim() ? circuit.room.trim() : 'General'
                );
                const uniqueRooms = [...new Set(rooms)];
                
                if (uniqueRooms.length > 0) {
                    typeGroups[type] = uniqueRooms;
                }
            }
        });

        // Generate smart labels for outlets and lighting
        Object.entries(typeGroups).forEach(([type, rooms]) => {
            const typeName = type === 'outlet' ? 'outlets' : 'lights';
            
            if (rooms.length === 1) {
                // Single room
                const room = rooms[0];
                labelParts.push(room === 'General' ? typeName : `${room} ${typeName}`);
            } else if (rooms.length <= 3) {
                // Few rooms - list them
                const roomList = rooms.filter(r => r !== 'General').join(' and ');
                const generalRooms = rooms.includes('General');
                
                if (generalRooms && roomList) {
                    labelParts.push(`${roomList} and general ${typeName}`);
                } else if (roomList) {
                    labelParts.push(`${roomList} ${typeName}`);
                } else {
                    labelParts.push(typeName);
                }
            } else {
                // Many rooms - use count
                const generalCount = rooms.includes('General') ? 1 : 0;
                const regularRooms = rooms.filter(r => r !== 'General');
                const totalRooms = regularRooms.length + generalCount;
                
                if (generalCount > 0) {
                    labelParts.push(`${totalRooms} room ${typeName}`);
                } else {
                    labelParts.push(`${totalRooms} room ${typeName}`);
                }
            }
        });

        // Handle any other types
        Object.entries(circuitsByType).forEach(([type, circuits]) => {
            if (!['appliance', 'heating', 'subpanel', 'outlet', 'lighting'].includes(type)) {
                circuits.forEach(circuit => {
                    if (circuit.notes && circuit.notes.trim()) {
                        labelParts.push(circuit.notes.trim());
                    } else if (circuit.room && circuit.room.trim()) {
                        labelParts.push(`${circuit.room} ${type}`);
                    } else {
                        labelParts.push(type);
                    }
                });
            }
        });

        return labelParts.length > 0 ? labelParts.join(', ') : '';
    }

    updateAmperageDisplay(breakerElement, breaker) {
        const container = breakerElement.closest('.breaker-container');
        const amperageBox = container.querySelector('.breaker-amperage-box');
        
        if (amperageBox && breaker.amperage) {
            amperageBox.textContent = `${breaker.amperage}A`;
            amperageBox.classList.add('has-amperage');
        } else if (amperageBox) {
            amperageBox.textContent = '';
            amperageBox.classList.remove('has-amperage');
        }
    }

    updateIndicators(breakerElement, breaker) {
        const indicators = breakerElement.querySelector('.breaker-indicators');
        indicators.innerHTML = '';
        
        if (!breaker) {
            return;
        }
        
        if (breaker.critical) {
            const criticalIndicator = document.createElement('div');
            criticalIndicator.className = 'indicator critical';
            criticalIndicator.title = 'Critical Circuit';
            indicators.appendChild(criticalIndicator);
        }
        
        if (breaker.monitor) {
            const monitorIndicator = document.createElement('div');
            monitorIndicator.className = 'indicator monitor';
            monitorIndicator.title = 'Should Monitor';
            indicators.appendChild(monitorIndicator);
        }
        
        if (breaker.confirmed) {
            const confirmedIndicator = document.createElement('div');
            confirmedIndicator.className = 'indicator confirmed';
            confirmedIndicator.title = 'Tested & Confirmed';
            indicators.appendChild(confirmedIndicator);
        }
    }

    async openBreakerModal(position, slot = 'single') {
        try {
            // Use cached breaker data instead of making API call
            const cacheKey = `${position}-${slot}`;
            this.app.currentBreaker = this.breakerCache.get(cacheKey);
            
            if (!this.app.currentBreaker) {
                this.app.currentBreaker = {
                    panel_id: this.app.currentPanel.id,
                    position: position,
                    label: '',
                    amperage: null,
                    critical: false,
                    monitor: false,
                    confirmed: false,
                    breaker_type: slot !== 'single' ? 'tandem' : 'single',
                    slot_position: slot
                };
            }

            this.populateBreakerForm();
            await this.loadCircuits();
            
            this.app.showModal('breaker-modal');
        } catch (error) {
            this.app.handleError('Failed to load breaker data', error);
        }
    }

    populateBreakerForm() {
        const breaker = this.app.currentBreaker;
        
        this.setFormValue('breaker-label', breaker.label || '');
        this.setFormValue('breaker-amperage', breaker.amperage || '');
        this.setFormValue('breaker-critical', breaker.critical || false);
        this.setFormValue('breaker-monitor', breaker.monitor || false);
        this.setFormValue('breaker-confirmed', breaker.confirmed || false);
        
        // Set breaker type - convert from legacy boolean fields if needed
        let breakerType = breaker.breaker_type || 'single';
        if (!breaker.breaker_type) {
            if (breaker.double_pole) breakerType = 'double_pole';
            else if (breaker.tandem) breakerType = 'tandem';
        }
        this.setFormValue('breaker-type', breakerType);
        // Disable breaker type dropdown for tandem B slots (only A slot can control type)
        const breakerTypeSelect = document.getElementById('breaker-type');
        if (breakerTypeSelect) {
            const isTandemB = (breakerType === 'tandem' || breaker.tandem) && breaker.slot_position === 'B';
            breakerTypeSelect.disabled = isTandemB;
            
            // Add visual indication for disabled state
            if (isTandemB) {
                breakerTypeSelect.style.opacity = '0.6';
                breakerTypeSelect.style.cursor = 'not-allowed';
                breakerTypeSelect.title = 'Tandem B slot is disabled when A is empty';
            } else {
                breakerTypeSelect.style.opacity = '';
                breakerTypeSelect.style.cursor = '';
                breakerTypeSelect.title = '';
            }
        }
    }

    setFormValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = Boolean(value);
            } else {
                element.value = value;
            }
        }
    }

    async loadCircuits() {
        const circuitsContainer = document.getElementById('circuits-container');
        if (!circuitsContainer) return;
        
        circuitsContainer.innerHTML = '';
        this.app.existingCircuits = [];
        
        if (this.app.currentBreaker.id) {
            try {
                // Use cached circuit data instead of making API call
                this.app.existingCircuits = this.circuitCache.get(this.app.currentBreaker.id) || [];
                this.app.existingCircuits.forEach(circuit => {
                    this.addCircuitForm(circuit);
                });
            } catch (error) {
                this.app.handleError('Failed to load circuits', error);
            }
        }
    }

    addCircuitForm(circuitData = null) {
        const circuitsContainer = document.getElementById('circuits-container');
        if (!circuitsContainer) return;
        
        this.app.circuitCounter++;
        
        const circuitDiv = document.createElement('div');
        circuitDiv.className = 'circuit';
        circuitDiv.dataset.circuitId = circuitData?.id || `new-${this.app.circuitCounter}`;
        
        circuitDiv.innerHTML = this.generateCircuitFormHTML(circuitData);
        
        this.bindCircuitEvents(circuitDiv, circuitData);
        circuitsContainer.appendChild(circuitDiv);
    }

    generateCircuitFormHTML(circuitData) {
        return `
            <div class="circuit-header">
                <div class="circuit-title">Circuit ${this.app.circuitCounter}</div>
                <div class="circuit-actions">
                    <button type="button" class="remove-circuit">Remove Circuit</button>
                </div>
            </div>
            <div class="circuit-form">
                <div class="form-group">
                    <label>Room</label>
                    <select name="room">
                        <option value="">Select room...</option>
                        ${this.generateRoomOptions(circuitData?.room_id)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select name="type">
                        <option value="outlet" ${!circuitData?.type || circuitData?.type === 'outlet' ? 'selected' : ''}>🔵 Outlet</option>
                        <option value="lighting" ${circuitData?.type === 'lighting' ? 'selected' : ''}>🟠 Lighting</option>
                        <option value="heating" ${circuitData?.type === 'heating' ? 'selected' : ''}>🔴 Heating</option>
                        <option value="appliance" ${circuitData?.type === 'appliance' ? 'selected' : ''}>🟢 Appliance</option>
                        <option value="subpanel" ${circuitData?.type === 'subpanel' ? 'selected' : ''}>🟣 Subpanel</option>
                    </select>
                </div>
                <div class="form-group subpanel-selector" style="display: ${circuitData?.type === 'subpanel' ? 'block' : 'none'};">
                    <label>Linked Panel</label>
                    <div class="subpanel-controls">
                        <select name="subpanel">
                            <option value="">Select panel...</option>
                            ${this.generateSubpanelOptions(circuitData?.subpanel_id)}
                        </select>
                        ${circuitData?.subpanel_id ? `<button type="button" class="goto-panel" data-panel-id="${circuitData.subpanel_id}">Go to Panel</button>` : ''}
                    </div>
                </div>
                <div class="form-group circuit-notes">
                    <label>Notes</label>
                    <textarea name="notes" placeholder="Additional notes...">${circuitData?.notes || ''}</textarea>
                </div>
            </div>
        `;
    }

    bindCircuitEvents(circuitDiv, circuitData) {
        // Remove circuit button
        const removeBtn = circuitDiv.querySelector('.remove-circuit');
        removeBtn.addEventListener('click', async () => {
            if (circuitData?.id) {
                try {
                    await this.app.api.deleteCircuit(circuitData.id);
                } catch (error) {
                    this.app.handleError('Failed to delete circuit', error);
                }
            }
            circuitDiv.remove();
        });
        
        // Type change handler
        const typeSelect = circuitDiv.querySelector('[name="type"]');
        typeSelect.addEventListener('change', (e) => {
            const subpanelSelector = circuitDiv.querySelector('.subpanel-selector');
            if (e.target.value === 'subpanel') {
                subpanelSelector.style.display = 'block';
            } else {
                subpanelSelector.style.display = 'none';
                subpanelSelector.querySelector('[name="subpanel"]').value = '';
            }
        });
        
        // Go to panel button
        const gotoPanelBtn = circuitDiv.querySelector('.goto-panel');
        if (gotoPanelBtn) {
            gotoPanelBtn.addEventListener('click', (e) => {
                const panelId = parseInt(e.target.dataset.panelId);
                this.app.closeModal();
                this.app.switchPanel(panelId);
            });
        }
    }

    generateSubpanelOptions(selectedId = null) {
        return this.app.allPanels
            .filter(panel => panel.id !== this.app.currentPanel.id)
            .map(panel => 
                `<option value="${panel.id}" ${selectedId == panel.id ? 'selected' : ''}>${panel.name}</option>`
            )
            .join('');
    }

    generateRoomOptions(selectedId = null) {
        return this.app.allRooms
            .map(room => 
                `<option value="${room.id}" ${selectedId == room.id ? 'selected' : ''}>${BreakerPanelApp.levelColors[room.level]} ${room.name}</option>`
            )
            .join('');
    }


    toggleBreakerType(e) {
        const breakerType = e.target.value;
        const position = this.app.currentBreaker.position;
        
        if (breakerType === 'double_pole' && position > this.app.currentPanel.size - 2) {
            alert('Cannot create a double pole breaker at this position. Double pole breakers must start on an odd position and extend to the next even position.');
            e.target.value = 'single';
            return;
        }
    }

    async saveBreakerForm(e) {
        e.preventDefault();
        
        try {
            const formData = new FormData(e.target);
            
            const amperage = formData.get('amperage');
            // Use current breaker type if form field is disabled (for tandem B-slots)
            const breakerType = formData.get('breakerType') || this.app.currentBreaker.breaker_type || 'single';
            const isTandem = breakerType === 'tandem';
            const breakerData = {
                label: formData.get('label'),
                amperage: amperage && amperage !== '' ? parseInt(amperage) : null,
                critical: formData.get('critical') === 'on',
                monitor: formData.get('monitor') === 'on',
                confirmed: formData.get('confirmed') === 'on',
                breaker_type: breakerType,
                slot_position: isTandem ? (this.app.currentBreaker.slot_position || 'A') : 'single'
            };

            if (this.app.currentBreaker.id) {
                await this.app.api.updateBreaker(this.app.currentBreaker.id, breakerData);
            } else {
                breakerData.panel_id = this.app.currentBreaker.panel_id;
                breakerData.position = this.app.currentBreaker.position;
                const savedBreaker = await this.app.api.createBreaker(breakerData);
                this.app.currentBreaker.id = savedBreaker.id;
            }

            Object.assign(this.app.currentBreaker, breakerData);
            
            // Update cache with the modified breaker
            this.updateBreakerCache(this.app.currentBreaker);
            
            await this.saveCircuits();
            
            // Get all breakers at this position from cache for display update
            const positionBreakers = [];
            for (const breaker of this.breakerCache.values()) {
                if (breaker.position === this.app.currentBreaker.position) {
                    positionBreakers.push(breaker);
                }
            }
            await this.updatePositionDisplay(this.app.currentBreaker.position, positionBreakers);
            
            this.closeModal();
        } catch (error) {
            this.app.handleError('Failed to save breaker', error);
        }
    }

    async saveCircuits() {
        const circuitElements = document.querySelectorAll('.circuit');
        
        for (const circuitElement of circuitElements) {
            const circuitId = circuitElement.dataset.circuitId;
            const isNew = circuitId.startsWith('new-');
            
            const room_id = circuitElement.querySelector('[name="room"]').value;
            const type = circuitElement.querySelector('[name="type"]').value;
            const notes = circuitElement.querySelector('[name="notes"]').value;
            const subpanelSelect = circuitElement.querySelector('[name="subpanel"]');
            const subpanel_id = subpanelSelect ? subpanelSelect.value : null;
            
            const circuitData = {
                room_id: room_id && room_id !== '' ? parseInt(room_id) : null,
                type: type || null,
                notes: notes || null,
                subpanel_id: subpanel_id && subpanel_id !== '' ? parseInt(subpanel_id) : null
            };
            
            try {
                if (isNew) {
                    if (!this.app.currentBreaker.id) {
                        console.error('Cannot save circuit: breaker has no ID');
                        continue;
                    }
                    circuitData.breaker_id = this.app.currentBreaker.id;
                    await this.app.api.createCircuit(circuitData);
                } else {
                    await this.app.api.updateCircuit(parseInt(circuitId), circuitData);
                }
            } catch (error) {
                this.app.handleError('Failed to save circuit', error);
            }
        }
    }

    closeModal() {
        this.app.hideModal('breaker-modal');
        this.app.currentBreaker = null;
        this.app.circuitCounter = 0;
        this.app.existingCircuits = [];
    }
}

// Export for Node.js environment (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PanelRenderer;
} else if (typeof global !== 'undefined') {
    global.PanelRenderer = PanelRenderer;
}