from flask import Flask, render_template, request, jsonify
import json
import sqlite3
import os
from simulation_engine import TrafficFlowSimulator, TrafficLightManager, MapManager, GeocodingService, RealStreetImporter

app = Flask(__name__)
traffic_simulator = TrafficFlowSimulator()
traffic_light_manager = TrafficLightManager()
map_manager = MapManager()
real_street_importer = RealStreetImporter()

# Configuração do banco SQLite
def init_db():
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    
    # Criar tabela streets
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS streets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            coordinates TEXT,
            length_km REAL DEFAULT 0.1,
            lanes INTEGER DEFAULT 2,
            vehicles_per_hour INTEGER DEFAULT 500,
            average_speed REAL DEFAULT 50,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tabela para semáforos de intersecção
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
    
    # Verificar e adicionar colunas faltantes
    cursor.execute("PRAGMA table_info(streets)")
    existing_columns = [column[1] for column in cursor.fetchall()]
    
    required_columns = ['length_km', 'vehicles_per_hour', 'average_speed']
    for column in required_columns:
        if column not in existing_columns:
            if column == 'length_km':
                cursor.execute(f'ALTER TABLE streets ADD COLUMN {column} REAL DEFAULT 0.1')
            elif column == 'vehicles_per_hour':
                cursor.execute(f'ALTER TABLE streets ADD COLUMN {column} INTEGER DEFAULT 500')
            elif column == 'average_speed':
                cursor.execute(f'ALTER TABLE streets ADD COLUMN {column} REAL DEFAULT 50')
    
    conn.commit()
    conn.close()
    print("✅ Banco de dados inicializado/verificado!")

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
              data.get('average_speed', 50)))
        
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
        cursor.execute('DELETE FROM intersection_traffic_lights WHERE street_id = ?', (street_id,))
        conn.commit()
        conn.close()
        return jsonify({'message': 'Rua removida com sucesso!'})
    
    else:  # GET
        conn = sqlite3.connect('traffic.db')
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, 
                   (SELECT COUNT(*) FROM intersection_traffic_lights WHERE street_id = s.id) as has_traffic_light
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
        traffic_light_manager.add_traffic_light(intersection_id, street_id, green_time, cycle_time)
        
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
        traffic_light_manager.remove_traffic_light(intersection_id, street_id)
        
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

@app.route('/api/simulate-flow', methods=['POST'])
def simulate_traffic_flow():
    """Nova rota para simulação de fluxo"""
    data = request.json
    
    conn = sqlite3.connect('traffic.db')
    cursor = conn.cursor()
    
    # Buscar ruas
    cursor.execute('SELECT * FROM streets')
    streets_data = cursor.fetchall()
    
    # Buscar semáforos
    cursor.execute('SELECT * FROM intersection_traffic_lights')
    traffic_lights_data = cursor.fetchall()
    conn.close()
    
    # Preparar dados
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
    
    traffic_lights = []
    for tl in traffic_lights_data:
        traffic_lights.append({
            'street_id': tl[2],
            'intersection_id': tl[1],
            'green_time': tl[4],
            'cycle_time': tl[3]
        })
    
    # Encontrar intersecções
    intersections = map_manager.find_intersections(streets)
    
    # Simular cada intersecção
    results = {
        'intersections': [],
        'overall_flow': {
            'total_cars_passing': 0,
            'total_waiting_time': 0,
            'average_wait_per_car': 0
        }
    }
    
    total_cars = 0
    total_wait = 0
    
    for intersection in intersections:
        intersection_result = traffic_simulator.simulate_intersection_flow(
            intersection, streets, traffic_lights
        )
        results['intersections'].append({
            'intersection_data': intersection,
            'flow_results': intersection_result
        })
        
        total_cars += intersection_result['total_cars_passing']
        total_wait += intersection_result['total_waiting_time']
    
    # Estatísticas gerais
    if total_cars > 0:
        results['overall_flow']['total_cars_passing'] = total_cars
        results['overall_flow']['total_waiting_time'] = total_wait
        results['overall_flow']['average_wait_per_car'] = total_wait / total_cars
    
    return jsonify(results)

@app.route('/api/search-street', methods=['POST'])
def search_street():
    data = request.json
    street_name = data.get('street_name', '')
    city = data.get('city', 'São Paulo')
    
    if not street_name:
        return jsonify({'error': 'Nome da rua é obrigatório'}), 400
    
    results = real_street_importer.geocoder.search_street(street_name, city)
    
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
    average_speed = data.get('average_speed', 50)
    lanes = data.get('lanes', 2)
    
    if not street_name:
        return jsonify({'error': 'Nome da rua é obrigatório'}), 400
    
    # Importar rua real
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
          lanes, vehicles_per_hour, average_speed))
    
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
        'lanes': lanes
    }
    
    intersections = map_manager.find_intersections(existing_streets + [imported_street])
    
    # Filtrar apenas intersecções envolvendo a rua importada
    street_intersections = []
    for intersection in intersections:
        if imported_street['id'] in intersection['streets']:
            street_intersections.append(intersection)
    
    return jsonify({
        'success': True,
        'message': message,
        'street_id': street_id,
        'street_data': imported_street,
        'intersections_found': len(street_intersections),
        'intersections': street_intersections,
        'details': {
            'comprimento_km': round(length_km, 3),
            'faixas': lanes,
            'velocidade_media': average_speed,
            'veiculos_hora': vehicles_per_hour
        }
    })

if __name__ == '__main__':
    init_db()
    print("✅ Banco de dados inicializado!")
    print("🚀 Servidor rodando em: http://localhost:5000")
    print("🎯 Simulador de Fluxo de Tráfego - Pronto!")
    app.run(debug=True)