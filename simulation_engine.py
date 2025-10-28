import math
import random
from datetime import datetime
import requests
import urllib.parse

class TrafficFlowSimulator:
    def __init__(self):
        self.simulation_time = 3600  # 1 hora em segundos
        
    def simulate_intersection_flow(self, intersection, streets, traffic_lights):
        """
        Simula o fluxo em uma intersecção - FOCADO EM TEMPO DE PARADA E FLUXO
        """
        intersection_id = self._get_intersection_id(intersection)
        
        results = {
            'intersection_id': intersection_id,
            'total_cars_passing': 0,
            'total_waiting_time': 0,
            'average_waiting_time': 0,
            'cars_per_hour': 0,
            'flow_efficiency': 'ALTA',
            'street_flows': {},
            'traffic_condition': 'FLUÍDO'
        }
        
        # Obter ruas da intersecção
        intersection_streets = []
        for street_id in intersection['streets']:
            street = next((s for s in streets if s['id'] == street_id), None)
            if street:
                intersection_streets.append(street)
        
        if not intersection_streets:
            return results
        
        total_cars = 0
        total_wait_time = 0
        
        for street in intersection_streets:
            street_id = street['id']
            has_traffic_light = any(tl for tl in traffic_lights if tl['street_id'] == street_id)
            
            # Dados da rua
            cars_per_hour = street.get('vehicles_per_hour', 500)
            lanes = street.get('lanes', 2)
            
            # Simulação baseada na presença de semáforo
            if has_traffic_light:
                street_flow = self._simulate_with_traffic_light(street, cars_per_hour, lanes)
            else:
                street_flow = self._simulate_without_traffic_light(street, cars_per_hour, lanes)
            
            results['street_flows'][street_id] = street_flow
            total_cars += street_flow['cars_passing']
            total_wait_time += street_flow['total_waiting_time']
        
        # Cálculos gerais
        results['total_cars_passing'] = total_cars
        results['total_waiting_time'] = total_wait_time
        results['cars_per_hour'] = total_cars
        results['average_waiting_time'] = total_wait_time / total_cars if total_cars > 0 else 0
        
        # Classificar condições de tráfego
        results['traffic_condition'] = self._classify_traffic_condition(results['average_waiting_time'])
        results['flow_efficiency'] = self._classify_flow_efficiency(total_cars, sum(s.get('vehicles_per_hour', 500) for s in intersection_streets))
        
        return results
    
    def _simulate_with_traffic_light(self, street, cars_per_hour, lanes):
        """Simula fluxo COM semáforo"""
        # Efeito do semáforo no fluxo
        base_flow = cars_per_hour * 0.7  # Redução de 30% devido ao semáforo
        cars_passing = int(base_flow * (lanes / 2))
        
        # Tempo de espera com semáforo (mais previsível)
        avg_wait_per_car = random.uniform(15, 45)  # 15-45 segundos
        total_waiting_time = cars_passing * avg_wait_per_car
        
        return {
            'cars_passing': cars_passing,
            'cars_waiting': int(cars_per_hour * 0.3),  # 30% dos carros esperando
            'average_wait_time': avg_wait_per_car,
            'total_waiting_time': total_waiting_time,
            'flow_status': 'CONTROLADO',
            'has_traffic_light': True,
            'wait_time_range': '15-45 segundos'
        }
    
    def _simulate_without_traffic_light(self, street, cars_per_hour, lanes):
        """Simula fluxo SEM semáforo"""
        # Fluxo mais eficiente sem semáforo
        base_flow = cars_per_hour * 0.9  # Apenas 10% de redução
        cars_passing = int(base_flow * (lanes / 2))
        
        # Tempo de espera sem semáforo (mais variável)
        avg_wait_per_car = random.uniform(5, 25)  # 5-25 segundos
        total_waiting_time = cars_passing * avg_wait_per_car
        
        return {
            'cars_passing': cars_passing,
            'cars_waiting': int(cars_per_hour * 0.1),  # 10% dos carros esperando
            'average_wait_time': avg_wait_per_car,
            'total_waiting_time': total_waiting_time,
            'flow_status': 'LIVRE',
            'has_traffic_light': False,
            'wait_time_range': '5-25 segundos'
        }
    
    def _classify_traffic_condition(self, avg_wait_time):
        """Classifica a condição do tráfego baseado no tempo de espera"""
        if avg_wait_time <= 10:
            return 'FLUÍDO'
        elif avg_wait_time <= 25:
            return 'MODERADO'
        elif avg_wait_time <= 45:
            return 'CONGESTIONADO'
        else:
            return 'PARADO'
    
    def _classify_flow_efficiency(self, actual_flow, potential_flow):
        """Classifica a eficiência do fluxo"""
        efficiency = (actual_flow / potential_flow) * 100 if potential_flow > 0 else 0
        if efficiency >= 80:
            return 'ALTA'
        elif efficiency >= 60:
            return 'MÉDIA'
        else:
            return 'BAIXA'
    
    def _get_intersection_id(self, intersection):
        """Gera ID único para intersecção"""
        streets_str = '-'.join(str(street_id) for street_id in sorted(intersection['streets']))
        return f"intersection_{streets_str}"

class TrafficLightManager:
    def __init__(self):
        self.intersection_lights = {}
    
    def add_traffic_light(self, intersection_id, street_id, green_time=30, cycle_time=90):
        """Adiciona semáforo a uma intersecção"""
        if intersection_id not in self.intersection_lights:
            self.intersection_lights[intersection_id] = {}
        
        self.intersection_lights[intersection_id][street_id] = {
            'green_time': green_time,
            'cycle_time': cycle_time,
            'red_time': cycle_time - green_time
        }
    
    def remove_traffic_light(self, intersection_id, street_id):
        """Remove semáforo de uma intersecção"""
        if intersection_id in self.intersection_lights and street_id in self.intersection_lights[intersection_id]:
            del self.intersection_lights[intersection_id][street_id]
    
    def get_intersection_lights(self, intersection_id):
        """Retorna semáforos de uma intersecção"""
        return self.intersection_lights.get(intersection_id, {})

# Classe para gerenciar o mapa e geometria (MANTIDA)
class MapManager:
    def __init__(self):
        self.streets = []
        self.intersections = []
    
    def calculate_street_length(self, coordinates):
        """Calcula comprimento da rua em km usando fórmula de Haversine"""
        if len(coordinates) < 2:
            return 0
        
        total_length = 0
        for i in range(len(coordinates) - 1):
            lat1, lon1 = coordinates[i]
            lat2, lon2 = coordinates[i + 1]
            
            # Fórmula de Haversine
            R = 6371  # Raio da Terra em km
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2) * math.sin(dlat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2) * math.sin(dlon/2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
            distance = R * c
            
            total_length += distance
        
        return total_length
    
    def find_intersections(self, streets):
        """Encontra intersecções entre ruas"""
        intersections = []
        
        for i, street1 in enumerate(streets):
            for j, street2 in enumerate(streets):
                if i >= j:  # Evitar duplicatas
                    continue
                
                coords1 = street1.get('coordinates', [])
                coords2 = street2.get('coordinates', [])
                
                # Verificar intersecções entre todos os segmentos
                intersections_found = self.find_intersections_between_streets(coords1, coords2)
                
                for intersection_point in intersections_found:
                    intersections.append({
                        'point': intersection_point,
                        'streets': [street1['id'], street2['id']],
                        'street_names': [street1.get('name', 'Rua ' + str(street1['id'])), 
                                       street2.get('name', 'Rua ' + str(street2['id']))],
                        'type': 'INTERSECTION'
                    })
        
        return intersections
    
    def find_intersections_between_streets(self, coords1, coords2):
        """Encontra todas as intersecções entre duas ruas"""
        intersections = []
        
        for i in range(len(coords1) - 1):
            for j in range(len(coords2) - 1):
                p1 = coords1[i]
                p2 = coords1[i + 1]
                p3 = coords2[j]
                p4 = coords2[j + 1]
                
                intersection = self.segment_intersection(p1, p2, p3, p4)
                if intersection:
                    intersections.append(intersection)
        
        return intersections
    
    def segment_intersection(self, p1, p2, p3, p4):
        """Calcula intersecção entre dois segmentos de linha"""
        x1, y1 = p1[1], p1[0]  # lon, lat
        x2, y2 = p2[1], p2[0]
        x3, y3 = p3[1], p3[0]
        x4, y4 = p4[1], p4[0]
        
        # Calcula determinante
        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        
        if abs(denom) < 1e-10:  # Linhas são paralelas
            return None
        
        # Calcula parâmetros de intersecção
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
        u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom
        
        # Verifica se a intersecção está dentro dos segmentos
        if 0 <= t <= 1 and 0 <= u <= 1:
            # Calcula ponto de intersecção
            x = x1 + t * (x2 - x1)
            y = y1 + t * (y2 - y1)
            return [y, x]  # Retorna [lat, lon]
        
        return None

# Classes de geocoding (MANTIDAS)
class GeocodingService:
    def __init__(self):
        self.nominatim_url = "https://nominatim.openstreetmap.org/search"
        self.headers = {
            'User-Agent': 'TrafficSimulator/1.0'
        }
    
    def search_street(self, street_name, city="São Paulo", country="Brasil", limit=5):
        """Busca ruas reais usando Nominatim"""
        query = f"{street_name}, {city}, {country}"
        
        params = {
            'q': query,
            'format': 'json',
            'limit': limit,
            'addressdetails': 1,
            'countrycodes': 'br'
        }
        
        try:
            response = requests.get(self.nominatim_url, params=params, headers=self.headers)
            response.raise_for_status()
            
            results = response.json()
            filtered_results = []
            
            for result in results:
                if any(term in result.get('type', '') for term in ['road', 'street', 'residential']) or \
                   any(term in result.get('class', '') for term in ['highway', 'road']):
                    filtered_results.append({
                        'display_name': result['display_name'],
                        'lat': float(result['lat']),
                        'lon': float(result['lon']),
                        'type': result.get('type', ''),
                        'class': result.get('class', ''),
                        'importance': result.get('importance', 0)
                    })
            
            return filtered_results
            
        except requests.RequestException as e:
            print(f"Erro na busca: {e}")
            return []

class RealStreetImporter:
    def __init__(self):
        self.geocoder = GeocodingService()
        self.map_manager = MapManager()
    
    def import_real_street(self, street_name, city="São Paulo", vehicles_per_hour=800, average_speed=50, lanes=2):
        """Importa uma rua real"""
        results = self.geocoder.search_street(street_name, city, limit=1)
        
        if not results:
            return None, "Rua não encontrada"
        
        # Cria rua simulada baseada na localização real
        result = results[0]
        center_lat, center_lon = result['lat'], result['lon']
        
        # Cria segmento de rua
        coordinates = self._create_street_segment(center_lat, center_lon)
        
        street_data = {
            'name': f"{street_name} (Real)",
            'coordinates': coordinates,
            'vehicles_per_hour': vehicles_per_hour,
            'average_speed': average_speed,
            'lanes': lanes,
            'real_street_data': result
        }
        
        return street_data, "Rua importada com sucesso"
    
    def _create_street_segment(self, center_lat, center_lon, length_km=0.3):
        """Cria um segmento de rua simulado"""
        lat_shift = length_km / 111.32 * 0.3
        lon_shift = length_km / (111.32 * abs(math.cos(math.radians(center_lat)))) * 0.7
        
        start_point = [center_lat - lat_shift/2, center_lon - lon_shift/2]
        end_point = [center_lat + lat_shift/2, center_lon + lon_shift/2]
        
        return [start_point, end_point]