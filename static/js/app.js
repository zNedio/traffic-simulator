// Mapa e estado da aplicação
let map;
let currentStreet = null;
let streets = [];
let intersections = [];
let currentPolyline = null;
let isDrawing = false;
let streetLayerGroup = L.layerGroup();
let intersectionLayerGroup = L.layerGroup();
let trafficLightLayerGroup = L.layerGroup();
let drawingMarkers = [];
let selectedIntersection = null;

// Variáveis para busca de ruas
let currentSearchResults = [];
let selectedSearchResult = null;

// Ícones personalizados
const trafficLightIcon = L.divIcon({
    className: 'traffic-light-marker',
    html: '<i class="fas fa-traffic-light" style="color: #e74c3c; font-size: 20px;"></i>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
});

const intersectionIcon = L.divIcon({
    className: 'intersection-marker',
    html: '<i class="fas fa-crosshairs" style="color: #9b59b6; font-size: 16px;"></i>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

const intersectionWithLightsIcon = L.divIcon({
    className: 'intersection-with-lights-marker',
    html: '<i class="fas fa-traffic-light" style="color: #e74c3c; font-size: 18px;"></i>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

const drawingIcon = L.divIcon({
    className: 'drawing-marker',
    html: '<i class="fas fa-map-pin" style="color: #3498db; font-size: 16px;"></i>',
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

// Inicializar mapa
function initMap() {
    map = L.map('map').setView([-23.5505, -46.6333], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Adicionar grupos de layers
    streetLayerGroup.addTo(map);
    intersectionLayerGroup.addTo(map);
    trafficLightLayerGroup.addTo(map);

    // Configurar eventos do mapa
    setupMapEvents();

    // Carregar dados existentes
    loadExistingStreets();
    loadIntersectionTrafficLights();

    updateStatus('Pronto para desenhar ruas - Clique em "Desenhar Rua" para começar');
}

// Configurar eventos do mapa
function setupMapEvents() {
    // Evento de clique único para adicionar pontos
    map.on('click', function(e) {
        if (isDrawing && currentStreet) {
            addPointToStreet(e.latlng);
        }
    });

    // Evento de duplo clique para finalizar
    map.on('dblclick', function(e) {
        if (isDrawing) {
            e.originalEvent.stopPropagation();
            finishStreetDrawing();
        }
    });

    // Teclas para controle do desenho
    document.addEventListener('keydown', function(e) {
        if (isDrawing) {
            switch(e.key) {
                case 'Escape':
                    e.preventDefault();
                    cancelStreetDrawing();
                    break;
                case 'Enter':
                    e.preventDefault();
                    finishStreetDrawing();
                    break;
                case 'Backspace':
                    e.preventDefault();
                    removeLastPoint();
                    break;
            }
        }
    });

    // Prevenir comportamento padrão do Enter no formulário
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !isDrawing) {
            if (e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        }
    });
}

// ========== SISTEMA DE DESENHO DE RUAS ==========

// Iniciar desenho de rua
function startStreetDrawing() {
    const streetName = document.getElementById('streetName').value || `Rua ${streets.length + 1}`;
    const vehiclesPerHour = parseInt(document.getElementById('vehiclesPerHour').value) || 500;
    const averageSpeed = parseInt(document.getElementById('averageSpeed').value) || 50;
    const lanes = parseInt(document.getElementById('lanes').value) || 2;

    if (!streetName) {
        alert('Por favor, informe um nome para a rua.');
        return;
    }

    // Limpar desenho anterior se existir
    cancelStreetDrawing();

    currentStreet = {
        name: streetName,
        coordinates: [],
        vehicles_per_hour: vehiclesPerHour,
        average_speed: averageSpeed,
        lanes: lanes
    };

    isDrawing = true;
    
    // Mostrar ajuda de teclado
    const keyboardHelp = document.getElementById('keyboardHelp');
    if (keyboardHelp) keyboardHelp.style.display = 'block';
    
    // Destacar status
    const statusElement = document.getElementById('drawingStatus');
    statusElement.classList.add('drawing-active');
    
    updateStatus('MODO DESENHO ATIVO: Clique para adicionar pontos • ENTER para finalizar • ESC para cancelar • BACKSPACE para remover último ponto');

    // Adicionar instrução visual no mapa
    L.popup()
        .setLatLng(map.getCenter())
        .setContent(`
            <strong>🎯 Modo Desenho Ativo</strong><br>
            <br>
            <strong>Como usar:</strong><br>
            • <strong>Clique</strong> - Adicionar ponto<br>
            • <strong>ENTER</strong> - Finalizar rua<br>  
            • <strong>ESC</strong> - Cancelar desenho<br>
            • <strong>BACKSPACE</strong> - Remover último ponto<br>
            • <strong>Duplo Clique</strong> - Finalizar rua<br>
            <br>
            <em>Adicione pelo menos 2 pontos</em>
        `)
        .openOn(map);
}

// Adicionar ponto à rua
function addPointToStreet(latlng) {
    if (!currentStreet) return;

    const point = [latlng.lat, latlng.lng];
    currentStreet.coordinates.push(point);

    // Adicionar marcador visual
    const marker = L.marker(latlng, { icon: drawingIcon })
        .addTo(map)
        .bindPopup(`Ponto ${currentStreet.coordinates.length}`)
        .openPopup();
    
    drawingMarkers.push(marker);

    updateStreetOnMap();
    
    // Mensagem de status melhorada
    const pointCount = currentStreet.coordinates.length;
    let statusMessage = `Ponto ${pointCount} adicionado. `;
    
    if (pointCount >= 2) {
        statusMessage += 'Pressione ENTER para finalizar ou continue adicionando pontos.';
    } else {
        statusMessage += 'Adicione mais pontos para criar a rua.';
    }
    
    updateStatus(statusMessage);
}

// Atualizar rua no mapa
function updateStreetOnMap() {
    if (!currentStreet || currentStreet.coordinates.length < 1) return;

    // Limpar polyline anterior
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
    }

    // Desenhar nova rua
    if (currentStreet.coordinates.length > 1) {
        currentPolyline = L.polyline(currentStreet.coordinates, {
            color: '#3498db',
            weight: 8,
            opacity: 0.8,
            lineCap: 'round',
            dashArray: isDrawing ? '10, 10' : null,
            className: isDrawing ? 'drawing-polyline' : ''
        }).addTo(map);
        
        // Ajustar visualização para mostrar a rua (com padding)
        if (currentStreet.coordinates.length >= 2) {
            map.fitBounds(currentPolyline.getBounds(), { 
                padding: [30, 30],
                maxZoom: 18 
            });
        }
    }
    
    // Se há apenas um ponto, mostrar apenas o marcador
    if (currentStreet.coordinates.length === 1 && currentPolyline) {
        map.removeLayer(currentPolyline);
        currentPolyline = null;
    }
}

// Finalizar desenho e salvar rua
async function finishStreetDrawing() {
    if (!currentStreet || currentStreet.coordinates.length < 2) {
        alert('É necessário pelo menos 2 pontos para criar uma rua.');
        return;
    }

    try {
        showLoading(true);
        updateStatus('Salvando rua...');

        const response = await fetch('/api/streets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currentStreet)
        });

        const result = await response.json();
        
        if (result.id) {
            // Adicionar à lista local
            currentStreet.id = result.id;
            currentStreet.length_km = result.length_km;
            streets.push(currentStreet);
            
            // Limpar marcadores de desenho
            clearDrawingMarkers();
            
            // Redesenhar todas as ruas
            drawAllStreets();
            
            updateStatus(`Rua "${currentStreet.name}" criada com sucesso! Comprimento: ${result.length_km} km`);
            
            // Mostrar confirmação
            alert(`Rua "${currentStreet.name}" salva com sucesso!\nComprimento: ${result.length_km} km\nPontos: ${currentStreet.coordinates.length}`);
            
            // Buscar intersecções automaticamente
            findIntersections();
        }
    } catch (error) {
        console.error('Erro ao salvar rua:', error);
        alert('Erro ao salvar rua. Verifique o console.');
    } finally {
        resetDrawingState();
        showLoading(false);
    }
}

// Cancelar desenho
function cancelStreetDrawing() {
    if (isDrawing) {
        clearDrawingMarkers();
        resetDrawingState();
        updateStatus('Desenho cancelado.');
    }
}

// Limpar marcadores de desenho
function clearDrawingMarkers() {
    drawingMarkers.forEach(marker => map.removeLayer(marker));
    drawingMarkers = [];
}

// Resetar estado de desenho
function resetDrawingState() {
    if (currentPolyline) {
        map.removeLayer(currentPolyline);
        currentPolyline = null;
    }
    currentStreet = null;
    isDrawing = false;
    
    // Ocultar ajuda de teclado
    const keyboardHelp = document.getElementById('keyboardHelp');
    if (keyboardHelp) keyboardHelp.style.display = 'none';
    
    // Remover destaque do status
    const statusElement = document.getElementById('drawingStatus');
    statusElement.classList.remove('drawing-active');
    
    // Fechar qualquer popup aberto
    map.closePopup();
}

// Remover último ponto adicionado
function removeLastPoint() {
    if (!currentStreet || currentStreet.coordinates.length === 0) {
        return;
    }

    // Remove o último ponto
    currentStreet.coordinates.pop();
    
    // Remove o último marcador
    if (drawingMarkers.length > 0) {
        const lastMarker = drawingMarkers.pop();
        map.removeLayer(lastMarker);
    }

    // Atualiza o desenho
    updateStreetOnMap();
    
    // Atualiza status
    const remainingPoints = currentStreet.coordinates.length;
    if (remainingPoints === 0) {
        updateStatus('Todos os pontos removidos. Adicione novos pontos ou pressione ESC para cancelar.');
    } else {
        updateStatus(`Último ponto removido. ${remainingPoints} ponto(s) restante(s). Pressione ENTER para finalizar ou continue adicionando pontos.`);
    }

    // Atualiza popups dos marcadores restantes
    drawingMarkers.forEach((marker, index) => {
        marker.setPopupContent(`Ponto ${index + 1}`);
    });
}

// ========== SISTEMA DE INTERSECÇÕES E SEMÁFOROS ==========

// Carregar ruas existentes
async function loadExistingStreets() {
    try {
        const response = await fetch('/api/streets');
        streets = await response.json();
        drawAllStreets();
        updateStreetCount();
        
        // Atualizar lista de semáforos na sidebar
        updateTrafficLightsSidebar();
        
        // Buscar intersecções automaticamente
        findIntersections();
    } catch (error) {
        console.error('Erro ao carregar ruas:', error);
    }
}

// Desenhar todas as ruas no mapa
function drawAllStreets() {
    streetLayerGroup.clearLayers();
    
    streets.forEach(street => {
        if (street.coordinates && street.coordinates.length > 1) {
            const isRealStreet = street.name.includes('(Real)');
            
            const polyline = L.polyline(street.coordinates, {
                color: isRealStreet ? '#9b59b6' : '#3498db',
                weight: 6,
                opacity: 0.8,
                dashArray: isRealStreet ? '5, 5' : null
            }).addTo(streetLayerGroup);
            
            // Adicionar popup com informações
            let popupContent = `
                <strong>${street.name}</strong><br>
                Veículos/hora: ${street.vehicles_per_hour}<br>
                Velocidade: ${street.average_speed} km/h<br>
                Faixas: ${street.lanes}<br>
                Comprimento: ${street.length_km ? street.length_km.toFixed(2) : 'N/A'} km
            `;
            
            if (isRealStreet) {
                popupContent += '<br><small><i class="fas fa-map-marker-alt"></i> Rua real importada</small>';
            }
            
            polyline.bindPopup(popupContent);
        }
    });
    
    updateStreetCount();
}

// Buscar intersecções
async function findIntersections() {
    try {
        showLoading(true);
        updateStatus('Buscando intersecções...');

        const response = await fetch('/api/intersections');
        const intersectionsData = await response.json();
        
        intersections = intersectionsData;
        
        if (intersections.length > 0) {
            drawIntersections(intersections);
            updateStatus(`${intersections.length} intersecção(ões) encontrada(s)!`);
        } else {
            updateStatus('Nenhuma intersecção encontrada.');
        }
        
    } catch (error) {
        console.error('Erro ao buscar intersecções:', error);
        updateStatus('Erro ao buscar intersecções.');
    } finally {
        showLoading(false);
    }
}

// Desenhar intersecções no mapa
function drawIntersections(intersections) {
    intersectionLayerGroup.clearLayers();
    
    intersections.forEach(intersection => {
        // Verificar se esta intersecção tem semáforos
        const hasLights = intersectionTrafficLights.some(light => 
            light.intersection_id === getIntersectionId(intersection)
        );
        
        const icon = hasLights ? intersectionWithLightsIcon : intersectionIcon;
        
        const marker = L.marker(intersection.point, { icon: icon })
            .addTo(intersectionLayerGroup)
            .bindPopup(`
                <strong>🚦 Intersecção</strong><br>
                Ruas: ${getIntersectionStreetNames(intersection)}<br>
                ${hasLights ? '<span style="color: #e74c3c;"><i class="fas fa-traffic-light"></i> Com semáforos</span>' : '<span style="color: #27ae60;"><i class="fas fa-car"></i> Sem semáforos</span>'}
                <br><br>
                <button onclick="selectIntersection('${getIntersectionId(intersection)}')" class="btn-popup">
                    <i class="fas fa-cog"></i> Gerenciar Semáforos
                </button>
                <button onclick="analyzeIntersection('${getIntersectionId(intersection)}')" class="btn-popup">
                    <i class="fas fa-chart-bar"></i> Analisar Fluxo
                </button>
            `)
            .on('click', function() {
                selectIntersection(getIntersectionId(intersection));
            });
    });
}

// Obter ID da intersecção
function getIntersectionId(intersection) {
    return `intersection_${intersection.streets.sort().join('-')}`;
}

// Obter nomes das ruas da intersecção
function getIntersectionStreetNames(intersection) {
    const streetNames = intersection.streets.map(streetId => {
        const street = streets.find(s => s.id === streetId);
        return street ? street.name : `Rua ${streetId}`;
    });
    return streetNames.join(' e ');
}

// Selecionar intersecção
async function selectIntersection(intersectionId) {
    selectedIntersection = intersections.find(intersection => 
        getIntersectionId(intersection) === intersectionId
    );
    
    if (!selectedIntersection) return;
    
    // Carregar semáforos desta intersecção
    await loadIntersectionTrafficLights(intersectionId);
    
    // Mostrar modal de gerenciamento
    showTrafficLightModal();
}

// Carregar semáforos da intersecção
let intersectionTrafficLights = [];
async function loadIntersectionTrafficLights(intersectionId = null) {
    try {
        let url = '/api/intersection-traffic-lights';
        if (intersectionId) {
            url += `?intersection_id=${intersectionId}`;
        }
        
        const response = await fetch(url);
        intersectionTrafficLights = await response.json();
        
        // Atualizar ícones das intersecções
        if (intersections.length > 0) {
            drawIntersections(intersections);
        }
        
        // Atualizar sidebar
        updateTrafficLightsSidebar();
    } catch (error) {
        console.error('Erro ao carregar semáforos:', error);
    }
}

// Atualizar sidebar com lista de semáforos
function updateTrafficLightsSidebar() {
    const sidebarContent = document.getElementById('trafficLightsList');
    if (!sidebarContent) return;

    if (intersectionTrafficLights.length === 0) {
        sidebarContent.innerHTML = `
            <div class="no-traffic-lights">
                <i class="fas fa-info-circle"></i>
                <p>Nenhum semáforo configurado</p>
                <small>Adicione semáforos clicando nas intersecções no mapa</small>
            </div>
        `;
        return;
    }

    let html = '<div class="traffic-lights-list">';
    
    intersectionTrafficLights.forEach(light => {
        const street = streets.find(s => s.id === light.street_id);
        const streetName = street ? street.name : `Rua ${light.street_id}`;
        
        html += `
            <div class="traffic-light-item">
                <div class="light-header">
                    <i class="fas fa-traffic-light" style="color: #e74c3c;"></i>
                    <strong>${streetName}</strong>
                </div>
                <div class="light-details">
                    <div class="light-config">
                        <span class="config-item">
                            <i class="fas fa-clock"></i>
                            Ciclo: ${light.cycle_time}s
                        </span>
                        <span class="config-item">
                            <i class="fas fa-leaf"></i>
                            Verde: ${light.green_time}s
                        </span>
                    </div>
                    <div class="light-actions">
                        <button onclick="removeTrafficLightFromSidebar('${light.intersection_id}', ${light.street_id})" class="btn-danger-small">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    sidebarContent.innerHTML = html;
}

// Remover semáforo da sidebar
async function removeTrafficLightFromSidebar(intersectionId, streetId) {
    if (!confirm('Tem certeza que deseja remover este semáforo?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/intersection-traffic-lights?intersection_id=${intersectionId}&street_id=${streetId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadIntersectionTrafficLights();
            updateStatus('Semáforo removido com sucesso!');
        }
    } catch (error) {
        console.error('Erro ao remover semáforo:', error);
        alert('Erro ao remover semáforo.');
    }
}

// Mostrar modal de gerenciamento de semáforos
function showTrafficLightModal() {
    if (!selectedIntersection) return;
    
    const intersectionId = getIntersectionId(selectedIntersection);
    const streetNames = getIntersectionStreetNames(selectedIntersection);
    
    // Criar conteúdo do modal
    let modalContent = `
        <div class="modal-header">
            <h3><i class="fas fa-traffic-light"></i> Gerenciar Semáforos</h3>
            <p><strong>Intersecção:</strong> ${streetNames}</p>
        </div>
        
        <div class="modal-body">
            <div class="traffic-light-controls">
                <h4><i class="fas fa-cog"></i> Configurar Semáforos</h4>
    `;
    
    // Adicionar controles para cada rua da intersecção
    selectedIntersection.streets.forEach(streetId => {
        const street = streets.find(s => s.id === streetId);
        if (!street) return;
        
        const existingLight = intersectionTrafficLights.find(light => 
            light.intersection_id === intersectionId && light.street_id === streetId
        );
        
        const hasLight = !!existingLight;
        
        modalContent += `
            <div class="street-light-control ${hasLight ? 'has-light' : ''}">
                <div class="street-info">
                    <strong>${street.name}</strong>
                    <span class="light-status ${hasLight ? 'active' : 'inactive'}">
                        ${hasLight ? 'COM SEMÁFORO' : 'SEM SEMÁFORO'}
                    </span>
                </div>
        `;
        
        if (hasLight) {
            modalContent += `
                <div class="light-config">
                    <div class="config-display">
                        <span>Ciclo: ${existingLight.cycle_time}s | Verde: ${existingLight.green_time}s</span>
                    </div>
                    <button onclick="removeTrafficLight('${intersectionId}', ${streetId})" class="btn-danger">
                        <i class="fas fa-trash"></i> Remover
                    </button>
                </div>
            `;
        } else {
            modalContent += `
                <div class="light-config">
                    <div class="config-inputs">
                        <div class="input-group">
                            <label>Tempo do Ciclo (s):</label>
                            <input type="number" id="cycle_${streetId}" value="90" min="30" max="180">
                        </div>
                        <div class="input-group">
                            <label>Tempo Verde (s):</label>
                            <input type="number" id="green_${streetId}" value="45" min="10" max="120">
                        </div>
                    </div>
                    <button onclick="addTrafficLight('${intersectionId}', ${streetId})" class="btn-primary">
                        <i class="fas fa-plus"></i> Adicionar
                    </button>
                </div>
            `;
        }
        
        modalContent += `</div>`;
    });
    
    modalContent += `
            </div>
            
            <div class="analysis-section">
                <button onclick="analyzeIntersection('${intersectionId}')" class="btn-simulate">
                    <i class="fas fa-chart-line"></i> Simular Fluxo de Tráfego
                </button>
            </div>
        </div>
        
        <div class="modal-footer">
            <button onclick="closeTrafficLightModal()" class="btn-secondary">Fechar</button>
        </div>
    `;
    
    // Mostrar modal
    showModal('Gerenciar Semáforos', modalContent);
}

// Adicionar semáforo à intersecção
async function addTrafficLight(intersectionId, streetId) {
    const cycleTime = parseInt(document.getElementById(`cycle_${streetId}`).value);
    const greenTime = parseInt(document.getElementById(`green_${streetId}`).value);
    
    if (greenTime >= cycleTime) {
        alert('O tempo verde deve ser menor que o tempo total do ciclo.');
        return;
    }
    
    try {
        const response = await fetch('/api/intersection-traffic-lights', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                intersection_id: intersectionId,
                street_id: streetId,
                cycle_time: cycleTime,
                green_time: greenTime
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadIntersectionTrafficLights(intersectionId);
            showTrafficLightModal(); // Recarregar modal
            updateStatus('Semáforo adicionado à intersecção!');
        } else {
            alert('Erro: ' + result.error);
        }
    } catch (error) {
        console.error('Erro ao adicionar semáforo:', error);
        alert('Erro ao adicionar semáforo.');
    }
}

// Remover semáforo da intersecção
async function removeTrafficLight(intersectionId, streetId) {
    if (!confirm('Tem certeza que deseja remover este semáforo?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/intersection-traffic-lights?intersection_id=${intersectionId}&street_id=${streetId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            await loadIntersectionTrafficLights(intersectionId);
            showTrafficLightModal(); // Recarregar modal
            updateStatus('Semáforo removido da intersecção!');
        }
    } catch (error) {
        console.error('Erro ao remover semáforo:', error);
        alert('Erro ao remover semáforo.');
    }
}

// ========== SISTEMA DE SIMULAÇÃO DE FLUXO ==========

// Executar simulação de fluxo
async function runFlowSimulation() {
    if (intersections.length === 0) {
        alert('É necessário ter intersecções para simular.');
        return;
    }

    showLoading(true);
    updateStatus('Simulando fluxo de tráfego...');
    
    try {
        const response = await fetch('/api/simulate-flow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        });

        const results = await response.json();
        displayFlowResults(results);
        updateStatus('Simulação de fluxo concluída!');
        
    } catch (error) {
        console.error('Erro na simulação:', error);
        alert('Erro ao executar simulação.');
        updateStatus('Erro na simulação.');
    } finally {
        showLoading(false);
    }
}

// Mostrar resultados de fluxo
function displayFlowResults(results) {
    const resultsDiv = document.getElementById('results');
    const contentDiv = document.getElementById('resultsContent');
    
    let html = '';
    
    // Estatísticas gerais
    if (results.overall_flow) {
        const flow = results.overall_flow;
        
        html += `
            <div class="flow-summary">
                <h3><i class="fas fa-chart-line"></i> Resumo do Fluxo</h3>
                <div class="flow-stats">
                    <div class="flow-stat">
                        <div class="stat-icon">🚗</div>
                        <div class="stat-info">
                            <div class="stat-value">${flow.total_cars_passing?.toLocaleString() || 0}</div>
                            <div class="stat-label">Carros Passando</div>
                        </div>
                    </div>
                    <div class="flow-stat">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-info">
                            <div class="stat-value">${flow.average_wait_per_car?.toFixed(1) || 0}s</div>
                            <div class="stat-label">Tempo Médio de Espera</div>
                        </div>
                    </div>
                    <div class="flow-stat">
                        <div class="stat-icon">🕒</div>
                        <div class="stat-info">
                            <div class="stat-value">${Math.round(flow.total_waiting_time / 60) || 0}min</div>
                            <div class="stat-label">Tempo Total de Espera</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Resultados por intersecção
    if (results.intersections && results.intersections.length > 0) {
        html += `<div class="intersection-flows">
            <h3><i class="fas fa-crosshairs"></i> Fluxo por Intersecção</h3>`;
        
        results.intersections.forEach((item, index) => {
            const intersection = item.intersection_data;
            const flow = item.flow_results;
            const streetNames = getIntersectionStreetNames(intersection);
            
            // Determinar cor baseada na condição do tráfego
            const conditionClass = getTrafficConditionClass(flow.traffic_condition);
            
            html += `
                <div class="intersection-flow ${conditionClass}">
                    <div class="flow-header">
                        <h4>${streetNames}</h4>
                        <span class="traffic-condition ${conditionClass}">
                            ${flow.traffic_condition}
                        </span>
                    </div>
                    
                    <div class="flow-visual">
                        <div class="cars-flowing">
                            <div class="flow-icon">🚗</div>
                            <div class="flow-info">
                                <strong>${flow.cars_per_hour?.toLocaleString() || 0} carros/hora</strong>
                                <span>passando pela intersecção</span>
                            </div>
                        </div>
                        
                        <div class="waiting-time">
                            <div class="time-icon">⏱️</div>
                            <div class="time-info">
                                <strong>${flow.average_waiting_time?.toFixed(1) || 0} segundos</strong>
                                <span>de espera média por carro</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="street-breakdown">
                        <h5>Detalhes por Rua:</h5>
                        ${Object.entries(flow.street_flows || {}).map(([streetId, streetFlow]) => {
                            const street = streets.find(s => s.id == streetId);
                            const streetName = street ? street.name : `Rua ${streetId}`;
                            const hasLight = streetFlow.has_traffic_light;
                            
                            return `
                                <div class="street-flow-detail">
                                    <div class="street-name">
                                        ${streetName}
                                        ${hasLight ? '<span class="traffic-light-indicator" title="Com semáforo">🚦</span>' : ''}
                                    </div>
                                    <div class="street-stats">
                                        <span class="cars">${streetFlow.cars_passing} carros/h</span>
                                        <span class="wait-time">${streetFlow.average_wait_time?.toFixed(1)}s espera</span>
                                        <span class="flow-status ${streetFlow.flow_status.toLowerCase()}">${streetFlow.flow_status}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    contentDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

// Analisar intersecção específica
async function analyzeIntersection(intersectionId) {
    try {
        showLoading(true);
        
        // Executar simulação completa
        const simulationResponse = await fetch('/api/simulate-flow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({})
        });
        
        const results = await simulationResponse.json();
        
        // Encontrar resultados desta intersecção
        const intersectionResult = results.intersections.find(item => 
            getIntersectionId(item.intersection_data) === intersectionId
        );
        
        if (intersectionResult) {
            showIntersectionAnalysis(intersectionResult.flow_results, intersectionResult.intersection_data);
        } else {
            alert('Não foi possível analisar esta intersecção.');
        }
        
    } catch (error) {
        console.error('Erro na análise:', error);
        alert('Erro ao analisar intersecção.');
    } finally {
        showLoading(false);
    }
}

// Mostrar análise da intersecção
function showIntersectionAnalysis(flowResults, intersection) {
    const streetNames = getIntersectionStreetNames(intersection);
    const conditionClass = getTrafficConditionClass(flowResults.traffic_condition);
    
    let analysisContent = `
        <div class="intersection-analysis">
            <h3><i class="fas fa-chart-bar"></i> Análise de Fluxo</h3>
            <p><strong>${streetNames}</strong></p>
            
            <div class="analysis-overview ${conditionClass}">
                <div class="overview-header">
                    <h4>Condição do Tráfego: ${flowResults.traffic_condition}</h4>
                </div>
                
                <div class="key-metrics">
                    <div class="metric-card">
                        <div class="metric-icon">🚗</div>
                        <div class="metric-content">
                            <div class="metric-value">${flowResults.cars_per_hour?.toLocaleString() || 0}</div>
                            <div class="metric-label">Carros por Hora</div>
                        </div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">⏱️</div>
                        <div class="metric-content">
                            <div class="metric-value">${flowResults.average_waiting_time?.toFixed(1) || 0}s</div>
                            <div class="metric-label">Tempo Médio de Espera</div>
                        </div>
                    </div>
                    
                    <div class="metric-card">
                        <div class="metric-icon">🕒</div>
                        <div class="metric-content">
                            <div class="metric-value">${Math.round(flowResults.total_waiting_time / 60) || 0}min</div>
                            <div class="metric-label">Tempo Total de Espera</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="street-analysis">
                <h5>Fluxo por Rua:</h5>
                ${Object.entries(flowResults.street_flows || {}).map(([streetId, streetFlow]) => {
                    const street = streets.find(s => s.id == streetId);
                    const streetName = street ? street.name : `Rua ${streetId}`;
                    const hasLight = streetFlow.has_traffic_light;
                    
                    return `
                        <div class="street-analysis-item">
                            <div class="street-header">
                                <strong>${streetName}</strong>
                                ${hasLight ? '<span class="light-badge">COM SEMÁFORO</span>' : '<span class="no-light-badge">SEM SEMÁFORO</span>'}
                            </div>
                            <div class="street-metrics">
                                <span class="metric">
                                    <i class="fas fa-car"></i>
                                    ${streetFlow.cars_passing} carros/h
                                </span>
                                <span class="metric">
                                    <i class="fas fa-clock"></i>
                                    ${streetFlow.average_wait_time?.toFixed(1)}s de espera
                                </span>
                                <span class="metric status-${streetFlow.flow_status.toLowerCase()}">
                                    ${streetFlow.flow_status}
                                </span>
                            </div>
                            <div class="wait-range">
                                <small>Tempo de espera: ${streetFlow.wait_time_range}</small>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="analysis-insights">
                <h5>💡 Insights:</h5>
                <p>${getTrafficInsights(flowResults)}</p>
            </div>
        </div>
    `;
    
    showModal('Análise de Fluxo', analysisContent);
}

// Classificar condição do tráfego
function getTrafficConditionClass(condition) {
    switch(condition) {
        case 'FLUÍDO': return 'flow-fluent';
        case 'MODERADO': return 'flow-moderate';
        case 'CONGESTIONADO': return 'flow-congested';
        case 'PARADO': return 'flow-stopped';
        default: return 'flow-unknown';
    }
}

// Gerar insights baseados nos resultados
function getTrafficInsights(flowResults) {
    const avgWait = flowResults.average_waiting_time || 0;
    const condition = flowResults.traffic_condition;
    
    if (condition === 'FLUÍDO') {
        return "O tráfego está fluindo muito bem! Os tempos de espera são baixos e o fluxo é eficiente.";
    } else if (condition === 'MODERADO') {
        return "O tráfego está em condições aceitáveis. Considere ajustes nos semáforos para melhorar o fluxo.";
    } else if (condition === 'CONGESTIONADO') {
        return "O tráfego está congestionado. Avalie a necessidade de mais semáforos ou ajuste os tempos existentes.";
    } else {
        return "Tráfego parado ou muito lento. São necessárias intervenções significativas para melhorar o fluxo.";
    }
}

// ========== SISTEMA DE BUSCA DE RUAS REAIS ==========

// Buscar rua real
async function searchRealStreet() {
    const streetName = document.getElementById('realStreetName').value;
    const city = document.getElementById('cityName').value;
    
    if (!streetName) {
        alert('Por favor, digite o nome de uma rua.');
        return;
    }
    
    const resultsDiv = document.getElementById('searchResults');
    const contentDiv = document.getElementById('searchResultsContent');
    
    // Mostrar loading
    contentDiv.innerHTML = `
        <div class="search-loading">
            <i class="fas fa-spinner"></i>
            <p>Buscando "${streetName}" em ${city}...</p>
        </div>
    `;
    resultsDiv.style.display = 'block';
    
    try {
        const response = await fetch('/api/search-street', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                street_name: streetName,
                city: city
            })
        });
        
        const data = await response.json();
        currentSearchResults = data.results;
        
        if (data.results.length === 0) {
            contentDiv.innerHTML = `
                <div class="search-loading">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Nenhuma rua encontrada para "${streetName}"</p>
                </div>
            `;
            return;
        }
        
        // Mostrar resultados
        let html = '';
        data.results.forEach((result, index) => {
            html += `
                <div class="search-result-item" onclick="selectSearchResult(${index})">
                    <div class="result-name">${result.display_name}</div>
                    <div class="result-details">
                        Coordenadas: ${result.lat.toFixed(4)}, ${result.lon.toFixed(4)}
                    </div>
                    <div class="result-type">${result.type || result.class}</div>
                </div>
            `;
        });
        
        contentDiv.innerHTML = html;
        selectedSearchResult = null;
        
    } catch (error) {
        console.error('Erro na busca:', error);
        contentDiv.innerHTML = `
            <div class="search-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao buscar rua. Tente novamente.</p>
            </div>
        `;
    }
}

// Selecionar resultado da busca
function selectSearchResult(index) {
    selectedSearchResult = currentSearchResults[index];
    
    // Atualizar UI
    const items = document.querySelectorAll('.search-result-item');
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    
    // Centralizar mapa no resultado
    if (selectedSearchResult) {
        map.setView([selectedSearchResult.lat, selectedSearchResult.lon], 15);
        
        // Adicionar marcador temporário
        L.marker([selectedSearchResult.lat, selectedSearchResult.lon])
            .addTo(map)
            .bindPopup(`<strong>${selectedSearchResult.display_name}</strong>`)
            .openPopup();
    }
}

// Importar rua real
async function importRealStreet() {
    const streetName = document.getElementById('realStreetName').value;
    const city = document.getElementById('cityName').value;
    const vehiclesPerHour = parseInt(document.getElementById('realStreetVehicles').value);
    
    if (!streetName) {
        alert('Por favor, digite o nome de uma rua.');
        return;
    }
    
    if (!selectedSearchResult) {
        alert('Por favor, selecione um resultado da busca antes de importar.');
        return;
    }
    
    try {
        showLoading(true);
        updateStatus(`Importando geometria real de ${streetName}...`);
        
        const response = await fetch('/api/import-street', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                street_name: streetName,
                city: city,
                vehicles_per_hour: vehiclesPerHour
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Mostrar mensagem de sucesso detalhada
            const resultsDiv = document.getElementById('searchResults');
            const contentDiv = document.getElementById('searchResultsContent');
            
            let successHtml = `
                <div class="import-success">
                    <i class="fas fa-check-circle"></i>
                    <h4>Rua Importada com Sucesso!</h4>
                    <p>${data.message}</p>
            `;
            
            successHtml += `
                <div class="import-details">
                    <p><strong>Comprimento:</strong> ${data.details.comprimento_km} km</p>
                    <p><strong>Faixas:</strong> ${data.details.faixas}</p>
                    <p><strong>Velocidade média:</strong> ${data.details.velocidade_media} km/h</p>
                    <p><strong>Veículos por hora:</strong> ${data.details.veiculos_hora}</p>
                    <p><strong>Intersecções encontradas:</strong> ${data.intersections_found}</p>
                </div>
            </div>
            `;
            
            contentDiv.innerHTML = successHtml;
            
            // Recarregar ruas e mostrar no mapa
            await loadExistingStreets();
            
            // Desenhar intersecções encontradas
            if (data.intersections && data.intersections.length > 0) {
                drawIntersections(data.intersections);
            }
            
            updateStatus(`Rua real "${streetName}" importada com sucesso!`);
            
        } else {
            alert('Erro ao importar rua: ' + data.error);
        }
        
    } catch (error) {
        console.error('Erro ao importar rua:', error);
        alert('Erro ao importar rua. Verifique o console.');
    } finally {
        showLoading(false);
    }
}

// ========== FUNÇÕES DE MODAL E UTILITÁRIOS ==========

// Mostrar modal
function showModal(title, content) {
    // Fechar modal existente primeiro
    closeModal();
    
    // Criar novo modal
    const modalHTML = `
        <div id="customModal" class="modal">
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 id="modalTitle">${title}</h3>
                    <span class="close" onclick="closeModal()">&times;</span>
                </div>
                <div class="modal-body" id="modalContent">
                    ${content}
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Mostrar modal
    const modal = document.getElementById('customModal');
    modal.style.display = 'block';
}

// Fechar modal
function closeModal() {
    const modal = document.getElementById('customModal');
    if (modal) {
        modal.remove();
    }
    // Garantir que os marcadores permaneçam visíveis
    if (intersections.length > 0) {
        drawIntersections(intersections);
    }
}

// Fechar modal de semáforos
function closeTrafficLightModal() {
    closeModal();
    selectedIntersection = null;
    // Redesenhar intersecções para garantir que os ícones estejam visíveis
    if (intersections.length > 0) {
        drawIntersections(intersections);
    }
}

// Funções auxiliares
function updateStatus(message) {
    const statusElement = document.getElementById('drawingStatus');
    if (statusElement) {
        const span = statusElement.querySelector('span');
        if (span) span.textContent = message;
    }
}

function updateStreetCount() {
    const countElement = document.getElementById('streetCount');
    if (countElement) {
        const span = countElement.querySelector('span');
        if (span) span.textContent = `Ruas: ${streets.length} | Intersecções: ${intersections.length}`;
    }
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

function clearMap() {
    // Limpar dados
    streets = [];
    intersections = [];
    intersectionTrafficLights = [];
    currentSearchResults = [];
    selectedSearchResult = null;
    selectedIntersection = null;
    
    // Limpar layers
    streetLayerGroup.clearLayers();
    intersectionLayerGroup.clearLayers();
    trafficLightLayerGroup.clearLayers();
    clearDrawingMarkers();
    
    // Limpar estado de desenho
    resetDrawingState();
    
    // Limpar UI
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('realStreetName').value = '';
    document.getElementById('results').style.display = 'none';
    
    updateStatus('Mapa limpo. Pronto para começar.');
    updateStreetCount();
}

// Inicializar aplicação
document.addEventListener('DOMContentLoaded', function() {
    initMap();
});