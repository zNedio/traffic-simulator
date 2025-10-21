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
                    <i class="fas fa-chart-bar"></i> Analisar
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
    } catch (error) {
        console.error('Erro ao carregar semáforos:', error);
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
                        <span class="efficiency">Eficiência: ${((existingLight.green_time / existingLight.cycle_time) * 100).toFixed(1)}%</span>
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
                    <i class="fas fa-chart-line"></i> Analisar Impacto dos Semáforos
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

// Analisar intersecção
async function analyzeIntersection(intersectionId) {
    try {
        showLoading(true);
        
        const response = await fetch('/api/intersection-analysis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                intersection_id: intersectionId
            })
        });
        
        const analysis = await response.json();
        showAnalysisResults(analysis, intersectionId);
        
    } catch (error) {
        console.error('Erro na análise:', error);
        alert('Erro ao analisar intersecção.');
    } finally {
        showLoading(false);
    }
}

// Mostrar resultados da análise
function showAnalysisResults(analysis, intersectionId) {
    const selectedIntersection = intersections.find(intersection => 
        getIntersectionId(intersection) === intersectionId
    );
    
    const streetNames = selectedIntersection ? getIntersectionStreetNames(selectedIntersection) : 'Intersecção';
    
    let analysisContent = `
        <div class="analysis-results">
            <h3><i class="fas fa-chart-bar"></i> Análise da Intersecção</h3>
            <p><strong>${streetNames}</strong></p>
            
            <div class="recommendation ${analysis.recommendation === 'ALTAMENTE RECOMENDADO' ? 'highly-recommended' : 
                                      analysis.recommendation === 'RECOMENDADO' ? 'recommended' : 
                                      analysis.recommendation === 'MARGINAL' ? 'marginal' : 'not-recommended'}">
                <h4>Recomendação: ${analysis.recommendation}</h4>
                <p>${getRecommendationMessage(analysis)}</p>
            </div>
            
            <div class="analysis-metrics">
                <div class="metric-row">
                    <div class="metric">
                        <span class="metric-label">Melhoria no Delay</span>
                        <span class="metric-value ${analysis.delay_improvement > 0 ? 'positive' : 'negative'}">
                            ${analysis.delay_improvement > 0 ? '+' : ''}${analysis.delay_improvement}%
                        </span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Melhoria no Throughput</span>
                        <span class="metric-value ${analysis.throughput_improvement > 0 ? 'positive' : 'negative'}">
                            ${analysis.throughput_improvement > 0 ? '+' : ''}${analysis.throughput_improvement}%
                        </span>
                    </div>
                </div>
                
                <div class="metric-details">
                    <h5>Detalhes:</h5>
                    <p><strong>Nível de Serviço:</strong> ${analysis.level_of_service_before} → ${analysis.level_of_service_after}</p>
                    <p><strong>Delay Médio:</strong> ${analysis.details.delay_antes}s → ${analysis.details.delay_depois}s</p>
                    <p><strong>Throughput:</strong> ${analysis.details.throughput_antes} → ${analysis.details.throughput_depois} veículos/h</p>
                </div>
            </div>
        </div>
    `;
    
    showModal('Análise da Intersecção', analysisContent);
}

function getRecommendationMessage(analysis) {
    if (analysis.recommendation === 'ALTAMENTE RECOMENDADO') {
        return 'Semáforos terão impacto muito positivo nesta intersecção!';
    } else if (analysis.recommendation === 'RECOMENDADO') {
        return 'Semáforos podem melhorar significativamente o fluxo.';
    } else if (analysis.recommendation === 'MARGINAL') {
        return 'Melhoria pequena - considere outras soluções de tráfego.';
    } else {
        return 'Semáforos podem piorar o congestionamento nesta intersecção.';
    }
}

// ========== SISTEMA DE SIMULAÇÃO AVANÇADA ==========

// Executar simulação avançada
async function runAdvancedSimulation() {
    if (intersections.length === 0) {
        alert('É necessário ter intersecções para simular.');
        return;
    }

    showLoading(true);
    updateStatus('Executando simulação avançada de intersecções...');
    
    try {
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'advanced_intersection'
            })
        });

        const results = await response.json();
        displayAdvancedResults(results);
        updateStatus('Simulação de intersecções concluída!');
        
    } catch (error) {
        console.error('Erro na simulação:', error);
        alert('Erro ao executar simulação.');
        updateStatus('Erro na simulação.');
    } finally {
        showLoading(false);
    }
}

// Mostrar resultados avançados
function displayAdvancedResults(results) {
    const resultsDiv = document.getElementById('results');
    const contentDiv = document.getElementById('resultsContent');
    
    let html = '';
    
    // Estatísticas gerais
    if (results.overall_stats) {
        const stats = results.overall_stats;
        
        html += `
            <div class="result-item success">
                <h4><i class="fas fa-chart-line"></i> Estatísticas Gerais do Sistema</h4>
                <div class="result-metric">
                    <span class="metric-label">Total de Intersecções</span>
                    <span class="metric-value">${stats.total_intersections}</span>
                </div>
                <div class="result-metric">
                    <span class="metric-label">Veículos Totais/hora</span>
                    <span class="metric-value">${stats.total_vehicles?.toFixed(0) || 0}</span>
                </div>
                <div class="result-metric">
                    <span class="metric-label">Delay Médio por Veículo</span>
                    <span class="metric-value">${stats.average_delay?.toFixed(1) || 0}s</span>
                </div>
                <div class="result-metric">
                    <span class="metric-label">Eficiência do Sistema</span>
                    <span class="metric-value">${stats.average_efficiency?.toFixed(1) || 0}%</span>
                </div>
            </div>
        `;
    }
    
    // Resultados por intersecção
    if (results.intersections && results.intersections.length > 0) {
        html += `<div class="result-item">
            <h4><i class="fas fa-crosshairs"></i> Resultados por Intersecção</h4>`;
        
        results.intersections.forEach((item, index) => {
            const intersection = item.intersection_data;
            const simResults = item.simulation_results;
            const streetNames = getIntersectionStreetNames(intersection);
            
            const losClass = `los-${simResults.level_of_service}`;
            
            html += `
                <div class="intersection-result ${losClass}">
                    <div class="intersection-header">
                        <strong>${streetNames}</strong>
                        <span class="los-badge ${losClass}">Nível ${simResults.level_of_service}</span>
                    </div>
                    
                    <div class="result-grid">
                        <div class="result-metric">
                            <span class="metric-label">Throughput</span>
                            <span class="metric-value">${simResults.total_throughput?.toFixed(0) || 0} veículos/h</span>
                        </div>
                        <div class="result-metric">
                            <span class="metric-label">Delay Médio</span>
                            <span class="metric-value">${simResults.average_delay?.toFixed(1) || 0}s</span>
                        </div>
                        <div class="result-metric">
                            <span class="metric-label">Eficiência</span>
                            <span class="metric-value">${simResults.intersection_efficiency?.toFixed(1) || 0}%</span>
                        </div>
                    </div>
                    
                    <div class="street-breakdown">
                        <strong>Detalhes por Rua:</strong>
                        ${Object.entries(simResults.street_results || {}).map(([streetId, streetResult]) => {
                            const street = streets.find(s => s.id == streetId);
                            const streetName = street ? street.name : `Rua ${streetId}`;
                            return `
                                <div class="street-detail">
                                    <span>${streetName}: ${streetResult.throughput?.toFixed(0)} veículos/h 
                                    (Delay: ${streetResult.delay_per_vehicle?.toFixed(1)}s)
                                    ${streetResult.has_traffic_light ? '🚦' : ''}</span>
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
            
            if (data.real_geometry) {
                successHtml += `<p><i class="fas fa-map-marked-alt"></i> <strong>Geometria real obtida do OpenStreetMap</strong></p>`;
            } else {
                successHtml += `<p><i class="fas fa-drafting-compass"></i> <strong>Geometria estimada baseada na localização</strong></p>`;
            }
            
            successHtml += `
                <div class="import-details">
                    <p><strong>Comprimento:</strong> ${data.details.comprimento_km} km</p>
                    <p><strong>Faixas:</strong> ${data.details.faixas}</p>
                    <p><strong>Velocidade média:</strong> ${data.details.velocidade_media} km/h</p>
                    <p><strong>Tipo de via:</strong> ${data.details.tipo_via}</p>
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
            
            updateStatus(`Rua real "${streetName}" importada com geometria ${data.real_geometry ? 'REAL' : 'estimada'}!`);
            
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
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    if (!modal) {
        // Criar modal se não existir
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
    } else {
        modalTitle.textContent = title;
        modalContent.innerHTML = content;
        modal.style.display = 'block';
    }
}

// Fechar modal
function closeModal() {
    const modal = document.getElementById('customModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Fechar modal de semáforos
function closeTrafficLightModal() {
    closeModal();
    selectedIntersection = null;
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