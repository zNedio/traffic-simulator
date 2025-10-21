from flask import Flask, render_template, request, jsonify
import json
import sqlite3
import os
from simulation_engine import TrafficSimulationEngine, MapManager, GeocodingService, RealStreetImporter, AdvancedTrafficSimulation, IntersectionTrafficLightManager

app = Flask(__name__)
simulation_engine = TrafficSimulationEngine()
map_manager = MapManager()
real_street_importer = RealStreetImporter()
advanced_simulator = AdvancedTrafficSimulation()

# Configuração do banco SQLite
def init_db():
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS streets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            coordinates TEXT,
            length_km REAL,
            lanes INTEGER,
            vehicles_per_hour INTEGER,
            average_speed REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS traffic_lights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            street_id INTEGER,
            position REAL,
            cycle_time INTEGER DEFAULT 60,
            green_time INTEGER DEFAULT 30,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS simulations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            data TEXT,
            results TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS intersection_traffic_lights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            intersection_id TEXT NOT NULL,
            street_id INTEGER NOT NULL,
            cycle_time INTEGER DEFAULT 90,
            green_time INTEGER DEFAULT 45,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (street_id) REFERENCES streets (id),
            UNIQUE(intersection_id, street_id)
        )
    ''')
    
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/streets', methods=['GET', 'POST', 'DELETE'])
def handle_streets():
    if request.method == 'POST':
        data = request.json
        
        # Calcular comprimento da rua
        length_km = map_manager.calculate_street_length(data['coordinates'])
        
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO streets (name, coordinates, length_km, lanes, vehicles_per_hour, average_speed)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (data['name'], json.dumps(data['coordinates']), length_km,
              data.get('lanes', 2), data.get('vehicles_per_hour', 500),
              data.get('average_speed', 40)))
        
        conn.commit()
        street_id = cursor.lastrowid
        conn.close()
        
        return jsonify({
            'id': street_id, 
            'message': 'Rua criada com sucesso!',
            'length_km': round(length_km, 3)
        })
    
    elif request.method == 'DELETE':
        street_id = request.args.get('id')
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        cursor.execute('DELETE FROM streets WHERE id = ?', (street_id,))
        cursor.execute('DELETE FROM traffic_lights WHERE street_id = ?', (street_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Rua removida com sucesso!'})
    
    else:  # GET
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, 
                   (SELECT COUNT(*) FROM traffic_lights WHERE street_id = s.id) as has_traffic_light
            FROM streets s
            ORDER BY s.created_at DESC
        ''')
        streets = cursor.fetchall()
        conn.close()
        
        street_list = []
        for s in streets:
            street_list.append({
                'id': s[0],
                'name': s[1],
                'coordinates': json.loads(s[2]),
                'length_km': s[3],
                'lanes': s[4],
                'vehicles_per_hour': s[5],
                'average_speed': s[6],
                'has_traffic_light': s[8] > 0
            })
        
        return jsonify(street_list)

@app.route('/api/traffic-lights', methods=['GET', 'POST', 'DELETE'])
def handle_traffic_lights():
    if request.method == 'POST':
        data = request.json
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO traffic_lights (street_id, position, cycle_time, green_time)
            VALUES (?, ?, ?, ?)
        ''', (data['street_id'], data.get('position', 0.5), 
              data.get('cycle_time', 60), data.get('green_time', 30)))
        
        conn.commit()
        traffic_light_id = cursor.lastrowid
        conn.close()
        
        return jsonify({'id': traffic_light_id, 'message': 'Semáforo adicionado com sucesso!'})
    
    elif request.method == 'DELETE':
        traffic_light_id = request.args.get('id')
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        cursor.execute('DELETE FROM traffic_lights WHERE id = ?', (traffic_light_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Semáforo removido com sucesso!'})
    
    else:  # GET
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT tl.*, s.name as street_name 
            FROM traffic_lights tl
            JOIN streets s ON tl.street_id = s.id
        ''')
        traffic_lights = cursor.fetchall()
        conn.close()
        
        return jsonify([{
            'id': tl[0],
            'street_id': tl[1],
            'street_name': tl[6],
            'position': tl[2],
            'cycle_time': tl[3],
            'green_time': tl[4]
        } for tl in traffic_lights])

@app.route('/api/simulate', methods=['POST'])
def simulate_traffic():
    data = request.json
    simulation_type = data.get('type', 'intersection')
    
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    
    # Buscar todas as ruas
    cursor.execute('SELECT * FROM streets')
    streets_data = cursor.fetchall()
    
    # Buscar todos os semáforos (agora da nova tabela)
    cursor.execute('SELECT * FROM intersection_traffic_lights')
    traffic_lights_data = cursor.fetchall()
    conn.close()
    
    # Preparar dados para simulação
    streets = []
    for s in streets_data:
        streets.append({
            'id': s[0],
            'name': s[1],
            'coordinates': json.loads(s[2]),
            'length_km': s[3],
            'lanes': s[4],
            'vehicles_per_hour': s[5],
            'average_speed': s[6]
        })
    
    # Carregar semáforos no gerenciador avançado
    for tl in traffic_lights_data:
        advanced_simulator.traffic_light_manager.add_traffic_light_to_intersection(
            tl[1],  # intersection_id
            tl[2],  # street_id
            tl[3],  # cycle_time
            tl[4]   # green_time
        )
    
    # Encontrar intersecções
    intersections = map_manager.find_intersections(streets)
    
    # Executar simulação
    if simulation_type == 'advanced_intersection' and intersections:
        results = {
            'intersections': [],
            'overall_stats': {
                'total_intersections': len(intersections),
                'total_vehicles': 0,
                'average_delay': 0,
                'average_efficiency': 0
            }
        }
        
        total_delay = 0
        total_vehicles = 0
        total_efficiency = 0
        
        for intersection in intersections:
            intersection_result = advanced_simulator.simulate_intersection_with_lights(
                intersection, streets
            )
            results['intersections'].append({
                'intersection_data': intersection,
                'simulation_results': intersection_result
            })
            
            total_delay += intersection_result['average_delay']
            total_vehicles += intersection_result['total_vehicles']
            total_efficiency += intersection_result['intersection_efficiency']
        
        # Estatísticas gerais
        if len(intersections) > 0:
            results['overall_stats']['average_delay'] = total_delay / len(intersections)
            results['overall_stats']['average_efficiency'] = total_efficiency / len(intersections)
            results['overall_stats']['total_vehicles'] = total_vehicles
        
        return jsonify(results)
    else:
        # Simulação individual por rua (fallback)
        results = {}
        for street in streets:
            street_traffic_lights = [tl for tl in traffic_lights_data if tl[2] == street['id']]
            street_results = simulation_engine.simulate_intersection([street], street_traffic_lights)
            street['simulation_results'] = street_results
    
    return jsonify({
        'simulation_results': results,
        'streets': streets,
        'traffic_lights': traffic_lights_data,
        'intersections': intersections
    })

@app.route('/api/intersections')
def get_intersections():
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM streets')
    streets_data = cursor.fetchall()
    conn.close()
    
    streets = []
    for s in streets_data:
        streets.append({
            'id': s[0],
            'name': s[1],
            'coordinates': json.loads(s[2]),
            'length_km': s[3],
            'lanes': s[4]
        })
    
    intersections = map_manager.find_intersections(streets)
    return jsonify(intersections)

@app.route('/api/search-street', methods=['POST'])
def search_street():
    data = request.json
    street_name = data.get('street_name', '')
    city = data.get('city', 'São Paulo')
    
    if not street_name:
        return jsonify({'error': 'Nome da rua é obrigatório'}), 400
    
    geocoder = GeocodingService()
    results = geocoder.search_street(street_name, city)
    
    return jsonify({
        'results': results,
        'count': len(results)
    })

@app.route('/api/import-street', methods=['POST'])
def import_street():
    data = request.json
    street_name = data.get('street_name', '')
    city = data.get('city', 'São Paulo')
    vehicles_per_hour = data.get('vehicles_per_hour', 800)
    average_speed = data.get('average_speed', None)  # Deixa None para auto-detecção
    lanes = data.get('lanes', None)  # Deixa None para auto-detecção
    
    if not street_name:
        return jsonify({'error': 'Nome da rua é obrigatório'}), 400
    
    # Importar rua real com geometria precisa
    street_data, message = real_street_importer.import_real_street(
        street_name, city, vehicles_per_hour, average_speed, lanes
    )
    
    if not street_data:
        return jsonify({'error': message}), 404
    
    # Salvar no banco
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    
    length_km = map_manager.calculate_street_length(street_data['coordinates'])
    
    cursor.execute('''
        INSERT INTO streets (name, coordinates, length_km, lanes, vehicles_per_hour, average_speed)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (street_data['name'], json.dumps(street_data['coordinates']), length_km,
          street_data['lanes'], street_data['vehicles_per_hour'], street_data['average_speed']))
    
    conn.commit()
    street_id = cursor.lastrowid
    conn.close()
    
    # Buscar intersecções com ruas existentes
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM streets WHERE id != ?', (street_id,))
    existing_streets_data = cursor.fetchall()
    conn.close()
    
    existing_streets = []
    for s in existing_streets_data:
        existing_streets.append({
            'id': s[0],
            'name': s[1],
            'coordinates': json.loads(s[2]),
            'length_km': s[3],
            'lanes': s[4]
        })
    
    imported_street = {
        'id': street_id,
        'name': street_data['name'],
        'coordinates': street_data['coordinates'],
        'length_km': length_km,
        'lanes': street_data['lanes']
    }
    
    intersections = real_street_importer.find_intersections_with_imported(
        imported_street, existing_streets
    )
    
    return jsonify({
        'success': True,
        'message': message,
        'street_id': street_id,
        'street_data': imported_street,
        'real_geometry': street_data.get('real_street_data', {}).get('source') == 'overpass',
        'intersections_found': len(intersections),
        'intersections': intersections,
        'details': {
            'comprimento_km': round(length_km, 3),
            'faixas': street_data['lanes'],
            'velocidade_media': street_data['average_speed'],
            'tipo_via': street_data.get('real_street_data', {}).get('highway_type', 'estimado')
        }
    })

@app.route('/api/intersection-traffic-lights', methods=['GET', 'POST', 'DELETE'])
def handle_intersection_traffic_lights():
    if request.method == 'POST':
        data = request.json
        intersection_id = data.get('intersection_id')
        street_id = data.get('street_id')
        cycle_time = data.get('cycle_time', 90)
        green_time = data.get('green_time', 45)
        
        if not intersection_id or not street_id:
            return jsonify({'error': 'intersection_id e street_id são obrigatórios'}), 400
        
        if green_time >= cycle_time:
            return jsonify({'error': 'Tempo verde deve ser menor que tempo do ciclo'}), 400
        
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        
        # Verificar se já existe
        cursor.execute('''
            SELECT * FROM intersection_traffic_lights 
            WHERE intersection_id = ? AND street_id = ?
        ''', (intersection_id, street_id))
        existing = cursor.fetchone()
        
        if existing:
            return jsonify({'error': 'Semáforo já existe nesta intersecção'}), 400
        
        # Inserir novo semáforo
        cursor.execute('''
            INSERT INTO intersection_traffic_lights 
            (intersection_id, street_id, cycle_time, green_time)
            VALUES (?, ?, ?, ?)
        ''', (intersection_id, street_id, cycle_time, green_time))
        
        conn.commit()
        light_id = cursor.lastrowid
        conn.close()
        
        # Atualizar no gerenciador
        advanced_simulator.traffic_light_manager.add_traffic_light_to_intersection(
            intersection_id, street_id, cycle_time, green_time
        )
        
        return jsonify({
            'success': True,
            'id': light_id,
            'message': 'Semáforo adicionado à intersecção'
        })
    
    elif request.method == 'DELETE':
        intersection_id = request.args.get('intersection_id')
        street_id = request.args.get('street_id')
        
        if not intersection_id or not street_id:
            return jsonify({'error': 'intersection_id e street_id são obrigatórios'}), 400
        
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            DELETE FROM intersection_traffic_lights 
            WHERE intersection_id = ? AND street_id = ?
        ''', (intersection_id, street_id))
        
        conn.commit()
        conn.close()
        
        # Remover do gerenciador
        advanced_simulator.traffic_light_manager.remove_traffic_light_from_intersection(
            intersection_id, street_id
        )
        
        return jsonify({'success': True, 'message': 'Semáforo removido da intersecção'})
    
    else:  # GET
        intersection_id = request.args.get('intersection_id')
        
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        
        if intersection_id:
            cursor.execute('''
                SELECT itl.*, s.name as street_name 
                FROM intersection_traffic_lights itl
                JOIN streets s ON itl.street_id = s.id
                WHERE itl.intersection_id = ?
            ''', (intersection_id,))
        else:
            cursor.execute('''
                SELECT itl.*, s.name as street_name 
                FROM intersection_traffic_lights itl
                JOIN streets s ON itl.street_id = s.id
            ''')
        
        traffic_lights = cursor.fetchall()
        conn.close()
        
        return jsonify([{
            'id': tl[0],
            'intersection_id': tl[1],
            'street_id': tl[2],
            'street_name': tl[5],
            'cycle_time': tl[3],
            'green_time': tl[4]
        } for tl in traffic_lights])

@app.route('/api/intersection-analysis', methods=['POST'])
def analyze_intersection():
    data = request.json
    intersection_id = data.get('intersection_id')
    
    if not intersection_id:
        return jsonify({'error': 'intersection_id é obrigatório'}), 400
    
    # Buscar dados das ruas
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM streets')
    streets_data = cursor.fetchall()
    conn.close()
    
    streets = []
    for s in streets_data:
        streets.append({
            'id': s[0],
            'name': s[1],
            'coordinates': json.loads(s[2]),
            'length_km': s[3],
            'lanes': s[4],
            'vehicles_per_hour': s[5],
            'average_speed': s[6]
        })
    
    # Criar objeto intersecção simulado
    intersection = {
        'streets': [int(street_id) for street_id in intersection_id.split('_')[1].split('-')],
        'point': [0, 0]  # Não usado na análise
    }
    
    # Simular sem semáforos
    streets_before = streets.copy()
    
    # Simular com semáforos (usando configuração atual)
    streets_after = streets.copy()
    
    analysis = advanced_simulator.evaluate_intersection_improvement(
        intersection, streets_before, streets_after
    )
    
    return jsonify(analysis)

if __name__ == '__main__':
    init_db()
    print("✅ Banco de dados inicializado!")
    print("🚀 Servidor rodando em: http://localhost:5000")
    print("🎯 Simulador de Tráfego com Intersecções - Pronto!")
    app.run(debug=True)