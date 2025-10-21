import math
import random
from datetime import datetime
import requests
import urllib.parse

class TrafficSimulationEngine:
    def __init__(self):
        self.simulation_time = 3600  # 1 hora em segundos
        self.time_step = 1  # 1 segundo por passo
        self.vehicles = []
        
    def calculate_street_capacity(self, length_km, lanes, has_traffic_light=False):
        """
        Calcula a capacidade teórica de uma rua baseada em parâmetros reais
        """
        # Capacidade base por faixa (veículos/hora/faixa)
        if has_traffic_light:
            base_capacity = 1800  # Reduzido para semáforos
        else:
            base_capacity = 2200  # Fluxo contínuo
        
        # Fator de ajuste pelo comprimento (ruas mais longas têm menor capacidade relativa)
        length_factor = min(1.0, 1.5 / max(length_km, 0.1))
        
        # Fator de ajuste por número de faixas
        lanes_factor = lanes * 0.9  # Eficiência reduzida com mais faixas
        
        capacity = base_capacity * lanes_factor * length_factor
        return int(capacity)
    
    def simulate_intersection(self, streets, traffic_lights):
        """
        Simula o comportamento em uma intersecção com semáforos - VERSÃO MELHORADA
        """
        results = {
            'total_vehicles': 0,
            'average_delay': 0,
            'throughput': 0,
            'congestion_level': 0,
            'street_results': {}
        }
        
        total_delay = 0
        total_vehicles = 0
        total_throughput = 0
        
        for street in streets:
            vehicles_per_hour = street.get('vehicles_per_hour', 500)
            lanes = street.get('lanes', 2)
            length_km = max(street.get('length_km', 0.5), 0.1)  # Mínimo 100m
            
            # Encontrar semáforo para esta rua
            traffic_light = next((tl for tl in traffic_lights if tl.get('street_id') == street.get('id')), None)
            has_light = traffic_light is not None
            
            # Capacidade da rua
            capacity = self.calculate_street_capacity(length_km, lanes, has_light)
            
            if has_light:
                # Cálculo REALISTA para semáforos
                cycle_time = traffic_light.get('cycle_time', 90)
                green_time = traffic_light.get('green_time', 45)
                
                # Razão verde/ciclo
                green_ratio = green_time / cycle_time
                
                # Capacidade efetiva com semáforo
                effective_capacity = int(capacity * green_ratio * 0.9)  # 10% de perda por aceleração/desaceleração
                
                # Throughput real (não pode exceder demanda nem capacidade)
                throughput = min(vehicles_per_hour, effective_capacity)
                
                # Delay baseado na saturação
                saturation = vehicles_per_hour / effective_capacity if effective_capacity > 0 else 1
                avg_delay = self.calculate_traffic_light_delay(saturation, cycle_time, green_time)
                
                # Congestionamento
                congestion = max(0, (vehicles_per_hour - throughput) / vehicles_per_hour * 100) if vehicles_per_hour > 0 else 0
                
            else:
                # Sem semáforo - fluxo contínuo
                throughput = min(vehicles_per_hour, capacity)
                avg_delay = 2  # Delay mínimo mesmo sem semáforo
                congestion = max(0, (vehicles_per_hour - throughput) / vehicles_per_hour * 100) if vehicles_per_hour > 0 else 0
            
            # Resultados para esta rua
            street_results = {
                'effective_throughput': throughput,
                'average_delay': avg_delay,
                'congestion': congestion,
                'capacity': capacity,
                'has_traffic_light': has_light,
                'saturation': vehicles_per_hour / capacity if capacity > 0 else 1
            }
            
            results['street_results'][street['id']] = street_results
            
            total_delay += avg_delay * vehicles_per_hour
            total_vehicles += vehicles_per_hour
            total_throughput += throughput
        
        # Resultados gerais
        if total_vehicles > 0:
            results['average_delay'] = total_delay / total_vehicles
            results['total_vehicles'] = total_vehicles
            results['throughput'] = total_throughput
            results['congestion_level'] = (1 - (total_throughput / total_vehicles)) * 100 if total_vehicles > 0 else 0
            results['efficiency'] = (total_throughput / total_vehicles) * 100 if total_vehicles > 0 else 100
        
        return results
    
    def calculate_traffic_light_delay(self, saturation, cycle_time, green_time):
        """
        Calcula delay realista em semáforos usando fórmula de Webster
        """
        if saturation < 0.1:
            return 5  # Delay mínimo para tráfego muito leve
        
        red_time = cycle_time - green_time
        
        # Fórmula simplificada de delay em semáforos
        if saturation <= 0.8:
            # Tráfego normal
            delay = red_time / 2 + (saturation * 10)
        elif saturation <= 0.95:
            # Tráfego saturado
            delay = red_time + ((saturation - 0.8) * 100)
        else:
            # Super saturado
            delay = red_time * 2 + ((saturation - 0.95) * 200)
        
        return min(delay, 300)  # Delay máximo de 5 minutos
    
    def evaluate_traffic_light_impact(self, streets_before, streets_after):
        """Avalia o impacto da adição de semáforos - VERSÃO MELHORADA"""
        if not streets_before or not streets_after:
            return {
                'congestion_improvement': 0,
                'recommendation': "DADOS INSUFICIENTES",
                'message': "Não há dados suficientes para análise"
            }
        
        # Calcula congestionamento total antes e depois
        total_congestion_before = sum(street.get('congestion', 0) for street in streets_before)
        total_congestion_after = sum(street.get('congestion', 0) for street in streets_after)
        
        # Calcula throughput total
        total_throughput_before = sum(street.get('effective_throughput', 0) for street in streets_before)
        total_throughput_after = sum(street.get('effective_throughput', 0) for street in streets_after)
        
        # Calcula melhoria
        if total_congestion_before > 0:
            congestion_improvement = ((total_congestion_before - total_congestion_after) / total_congestion_before) * 100
        else:
            congestion_improvement = 0
        
        # Calcula melhoria no throughput
        if total_throughput_before > 0:
            throughput_improvement = ((total_throughput_after - total_throughput_before) / total_throughput_before) * 100
        else:
            throughput_improvement = 0
        
        # Decisão baseada em múltiplos fatores
        if congestion_improvement > 15 or throughput_improvement > 10:
            recommendation = "ALTAMENTE RECOMENDADO"
            message = "Semáforo terá impacto POSITIVO significativo"
        elif congestion_improvement > 5 or throughput_improvement > 3:
            recommendation = "RECOMENDADO"
            message = "Semáforo pode melhorar o fluxo de tráfego"
        elif congestion_improvement > 0:
            recommendation = "MARGINAL"
            message = "Melhoria pequena - avalie outros fatores"
        else:
            recommendation = "NÃO RECOMENDADO"
            message = "Semáforo pode piorar o congestionamento"
        
        return {
            'congestion_improvement': round(congestion_improvement, 1),
            'throughput_improvement': round(throughput_improvement, 1),
            'recommendation': recommendation,
            'message': message,
            'details': {
                'congestion_antes': round(total_congestion_before, 1),
                'congestion_depois': round(total_congestion_after, 1),
                'throughput_antes': round(total_throughput_before, 0),
                'throughput_depois': round(total_throughput_after, 0)
            }
        }

# Classe para gerenciar o mapa e geometria
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
        """Encontra intersecções entre ruas com algoritmo melhorado"""
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

class GeocodingService:
    def __init__(self):
        self.nominatim_url = "https://nominatim.openstreetmap.org/search"
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.headers = {
            'User-Agent': 'TrafficSimulator/1.0 (mikael@example.com)'
        }
    
    def search_street(self, street_name, city="São Paulo", country="Brasil", limit=5):
        """
        Busca ruas reais usando Nominatim (para nomes)
        """
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
                # Filtrar resultados mais relevantes
                if any(term in result.get('type', '') for term in ['road', 'street', 'residential']) or \
                   any(term in result.get('class', '') for term in ['highway', 'road']):
                    filtered_results.append({
                        'display_name': result['display_name'],
                        'lat': float(result['lat']),
                        'lon': float(result['lon']),
                        'type': result.get('type', ''),
                        'class': result.get('class', ''),
                        'importance': result.get('importance', 0),
                        'osm_id': result.get('osm_id'),
                        'osm_type': result.get('osm_type')
                    })
            
            return filtered_results
            
        except requests.RequestException as e:
            print(f"Erro na busca Nominatim: {e}")
            return []
    
    def get_street_geometry(self, street_name, city="São Paulo", bbox=None):
        """
        Obtém a geometria REAL da rua usando Overpass API
        """
        # Query Overpass para buscar a rua exata
        if bbox:
            bbox_filter = f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
        else:
            # Bbox padrão para São Paulo
            bbox_filter = "-23.8,-46.9,-23.4,-46.3"
        
        overpass_query = f"""
        [out:json][timeout:25];
        (
          way["name"~"{street_name}", i]({bbox_filter});
          relation["name"~"{street_name}", i]({bbox_filter});
        );
        out body;
        >;
        out skel qt;
        """
        
        try:
            response = requests.post(
                self.overpass_url,
                data=overpass_query,
                headers=self.headers
            )
            response.raise_for_status()
            
            data = response.json()
            return self._process_overpass_data(data, street_name)
            
        except requests.RequestException as e:
            print(f"Erro na busca Overpass: {e}")
            return None
    
    def _process_overpass_data(self, data, street_name):
        """
        Processa os dados do Overpass para extrair geometrias
        """
        if not data or 'elements' not in data:
            return None
        
        streets = []
        
        for element in data['elements']:
            if element['type'] == 'way' and 'geometry' in element:
                coordinates = []
                for point in element['geometry']:
                    coordinates.append([point['lat'], point['lon']])
                
                if len(coordinates) >= 2:
                    streets.append({
                        'name': element.get('tags', {}).get('name', street_name),
                        'coordinates': coordinates,
                        'length_km': self.calculate_geometry_length(coordinates),
                        'osm_id': element['id'],
                        'highway_type': element.get('tags', {}).get('highway', 'road'),
                        'lanes': self._estimate_lanes(element.get('tags', {})),
                        'oneway': element.get('tags', {}).get('oneway', 'no') == 'yes'
                    })
        
        # Retorna a rua mais longa (provavelmente a principal)
        if streets:
            return max(streets, key=lambda x: x['length_km'])
        
        return None
    
    def calculate_geometry_length(self, coordinates):
        """Calcula comprimento real da geometria em km"""
        if len(coordinates) < 2:
            return 0
        
        total_length = 0
        for i in range(len(coordinates) - 1):
            lat1, lon1 = coordinates[i]
            lat2, lon2 = coordinates[i + 1]
            total_length += self.haversine_distance(lat1, lon1, lat2, lon2)
        
        return total_length
    
    def haversine_distance(self, lat1, lon1, lat2, lon2):
        """Calcula distância entre dois pontos usando fórmula de Haversine"""
        R = 6371  # Raio da Terra em km
        
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
        a = (math.sin(dlat/2) * math.sin(dlat/2) + 
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
             math.sin(dlon/2) * math.sin(dlon/2))
        
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    def _estimate_lanes(self, tags):
        """Estima número de faixas baseado no tipo de via"""
        highway_type = tags.get('highway', '')
        lanes_tag = tags.get('lanes')
        
        if lanes_tag and lanes_tag.isdigit():
            return int(lanes_tag)
        
        # Estimativas baseadas no tipo de via
        lane_estimates = {
            'motorway': 4,
            'trunk': 3,
            'primary': 3,
            'secondary': 2,
            'tertiary': 2,
            'residential': 1,
            'service': 1,
            'unclassified': 1
        }
        
        return lane_estimates.get(highway_type, 2)

class RealStreetImporter:
    def __init__(self):
        self.geocoder = GeocodingService()
        self.map_manager = MapManager()
    
    def import_real_street(self, street_name, city="São Paulo", vehicles_per_hour=800, 
                          average_speed=50, lanes=None):
        """
        Importa uma rua REAL com geometria precisa
        """
        print(f"Buscando geometria real para: {street_name}")
        
        # Primeiro busca no Nominatim para obter localização aproximada
        nominatim_results = self.geocoder.search_street(street_name, city, limit=1)
        
        if not nominatim_results:
            return None, "Rua não encontrada no Nominatim"
        
        # Usa a localização do Nominatim para buscar a geometria real no Overpass
        nominatim_result = nominatim_results[0]
        bbox = self._create_bbox_around_point(nominatim_result['lat'], nominatim_result['lon'], 0.02)
        
        street_geometry = self.geocoder.get_street_geometry(street_name, city, bbox)
        
        if not street_geometry:
            # Fallback: cria rua simulada baseada na localização do Nominatim
            print("Geometria não encontrada, criando rua simulada")
            return self._create_fallback_street(nominatim_result, street_name, vehicles_per_hour, average_speed, lanes)
        
        # Usa a geometria real encontrada
        print(f"Geometria real encontrada! Comprimento: {street_geometry['length_km']:.3f} km")
        
        street_data = {
            'name': f"{street_geometry['name']} (Real)",
            'coordinates': street_geometry['coordinates'],
            'vehicles_per_hour': vehicles_per_hour,
            'average_speed': self._estimate_speed_from_highway_type(street_geometry['highway_type']),
            'lanes': lanes or street_geometry['lanes'],
            'real_street_data': {
                'osm_id': street_geometry['osm_id'],
                'highway_type': street_geometry['highway_type'],
                'oneway': street_geometry['oneway'],
                'source': 'overpass'
            }
        }
        
        return street_data, "Rua real importada com geometria precisa"
    
    def _create_bbox_around_point(self, lat, lon, radius_degrees=0.01):
        """Cria uma bounding box ao redor de um ponto"""
        return [
            lat - radius_degrees,
            lon - radius_degrees,
            lat + radius_degrees,
            lon + radius_degrees
        ]
    
    def _create_fallback_street(self, nominatim_result, street_name, vehicles_per_hour, average_speed, lanes):
        """Cria rua simulada quando não encontra geometria real"""
        center_lat, center_lon = nominatim_result['lat'], nominatim_result['lon']
        
        # Cria um segmento mais realista baseado na orientação da cidade
        coordinates = self._create_realistic_street_segment(center_lat, center_lon)
        
        street_data = {
            'name': f"{street_name} (Estimada)",
            'coordinates': coordinates,
            'vehicles_per_hour': vehicles_per_hour,
            'average_speed': average_speed,
            'lanes': lanes or 2,
            'real_street_data': nominatim_result
        }
        
        return street_data, "Rua criada com localização real (geometria estimada)"
    
    def _create_realistic_street_segment(self, center_lat, center_lon, length_km=0.5):
        """Cria segmento de rua mais realista"""
        # Para São Paulo, ruas geralmente seguem padrão de grade
        # Cria segmento reto com orientação plausível
        lat_shift = length_km / 111.32 * 0.3  # Pequena variação em latitude
        lon_shift = length_km / (111.32 * abs(math.cos(math.radians(center_lat)))) * 0.7
        
        start_point = [center_lat - lat_shift/2, center_lon - lon_shift/2]
        end_point = [center_lat + lat_shift/2, center_lon + lon_shift/2]
        
        # Adiciona pontos intermediários para suavizar
        mid_point1 = [center_lat - lat_shift/4, center_lon - lon_shift/4]
        mid_point2 = [center_lat + lat_shift/4, center_lon + lon_shift/4]
        
        return [start_point, mid_point1, mid_point2, end_point]
    
    def _estimate_speed_from_highway_type(self, highway_type):
        """Estima velocidade baseada no tipo de via"""
        speed_estimates = {
            'motorway': 90,
            'trunk': 80,
            'primary': 60,
            'secondary': 50,
            'tertiary': 40,
            'residential': 30,
            'service': 20,
            'unclassified': 40
        }
        return speed_estimates.get(highway_type, 50)
    
    def find_intersections_with_imported(self, imported_street, existing_streets):
        """
        Encontra intersecções entre a rua importada e as existentes
        """
        all_streets = existing_streets + [imported_street]
        intersections = self.map_manager.find_intersections(all_streets)
        
        # Filtra apenas intersecções envolvendo a rua importada
        street_intersections = []
        for intersection in intersections:
            if imported_street.get('id') in intersection['streets']:
                street_intersections.append(intersection)
        
        return street_intersections
    
class IntersectionTrafficLightManager:
    
        def __init__(self):
            self.intersection_lights = {}  # {intersection_id: {street_id: traffic_light_data}}
    
        def add_traffic_light_to_intersection(self, intersection_id, street_id, cycle_time=90, green_time=45):
            """Adiciona semáforo a uma rua específica em uma intersecção"""
            if intersection_id not in self.intersection_lights:
                self.intersection_lights[intersection_id] = {}
            
            self.intersection_lights[intersection_id][street_id] = {
                'cycle_time': cycle_time,
                'green_time': green_time,
                'green_ratio': green_time / cycle_time,
                'red_time': cycle_time - green_time
            }
        
        def remove_traffic_light_from_intersection(self, intersection_id, street_id):
            """Remove semáforo de uma intersecção"""
            if intersection_id in self.intersection_lights and street_id in self.intersection_lights[intersection_id]:
                del self.intersection_lights[intersection_id][street_id]
        
        def get_intersection_lights(self, intersection_id):
            """Retorna todos os semáforos de uma intersecção"""
            return self.intersection_lights.get(intersection_id, {})
        
        def has_traffic_light(self, intersection_id, street_id):
            """Verifica se uma rua tem semáforo na intersecção"""
            return (intersection_id in self.intersection_lights and 
                    street_id in self.intersection_lights[intersection_id])

class AdvancedTrafficSimulation:
    def __init__(self):
        self.traffic_light_manager = IntersectionTrafficLightManager()
        self.simulation_time = 3600  # 1 hora
        self.time_step = 1  # 1 segundo
    
    def simulate_intersection_with_lights(self, intersection, streets, simulation_time=3600):
        """
        Simulação REALISTA de intersecção com semáforos
        Baseado no Highway Capacity Manual (HCM)
        """
        intersection_id = self._get_intersection_id(intersection)
        traffic_lights = self.traffic_light_manager.get_intersection_lights(intersection_id)
        
        results = {
            'intersection_id': intersection_id,
            'total_vehicles': 0,
            'total_delay': 0,
            'total_throughput': 0,
            'average_delay': 0,
            'level_of_service': 'A',
            'street_results': {},
            'intersection_efficiency': 0
        }
        
        # Obter ruas da intersecção
        intersection_streets = []
        for street_id in intersection['streets']:
            street = next((s for s in streets if s['id'] == street_id), None)
            if street:
                intersection_streets.append(street)
        
        if not intersection_streets:
            return results
        
        total_capacity = 0
        total_volume = 0
        
        for street in intersection_streets:
            street_id = street['id']
            has_traffic_light = street_id in traffic_lights
            
            # Dados da rua
            volume = street.get('vehicles_per_hour', 500)
            lanes = street.get('lanes', 2)
            speed = street.get('average_speed', 50)
            length = max(street.get('length_km', 0.5), 0.1)
            
            # Cálculos de capacidade e desempenho
            if has_traffic_light:
                light_data = traffic_lights[street_id]
                street_result = self._calculate_signalized_street_performance(
                    volume, lanes, length, speed, light_data
                )
            else:
                street_result = self._calculate_unsignalized_street_performance(
                    volume, lanes, length, speed
                )
            
            results['street_results'][street_id] = street_result
            results['total_vehicles'] += volume
            results['total_delay'] += street_result['total_delay']
            results['total_throughput'] += street_result['throughput']
            
            total_capacity += street_result['capacity']
            total_volume += volume
        
        # Cálculos gerais da intersecção
        if results['total_vehicles'] > 0:
            results['average_delay'] = results['total_delay'] / results['total_vehicles']
            results['intersection_efficiency'] = (results['total_throughput'] / results['total_vehicles']) * 100
        
        # Nível de Serviço (Level of Service)
        results['level_of_service'] = self._calculate_level_of_service(results['average_delay'])
        
        return results
    
    def _calculate_signalized_street_performance(self, volume, lanes, length, speed, light_data):
        """Calcula desempenho para rua com semáforo"""
        # Capacidade básica (HCM)
        base_capacity = 1900 * lanes
        
        # Fator de ajuste para semáforo
        green_ratio = light_data['green_ratio']
        cycle_efficiency = 0.9  # 10% de perda por aceleração/desaceleração
        
        # Capacidade efetiva
        capacity = base_capacity * green_ratio * cycle_efficiency
        
        # Throughput (não pode exceder volume nem capacidade)
        throughput = min(volume, capacity)
        
        # Delay calculado (fórmula Webster)
        saturation = volume / capacity if capacity > 0 else 1
        delay = self._calculate_signal_delay(saturation, light_data['cycle_time'], 
                                           light_data['green_time'], volume)
        
        # Congestionamento
        congestion = max(0, (volume - throughput) / volume * 100) if volume > 0 else 0
        
        return {
            'throughput': throughput,
            'capacity': capacity,
            'delay_per_vehicle': delay,
            'total_delay': delay * volume,
            'congestion': congestion,
            'saturation': saturation,
            'has_traffic_light': True,
            'green_ratio': green_ratio,
            'efficiency': (throughput / volume) * 100 if volume > 0 else 0
        }
    
    def _calculate_unsignalized_street_performance(self, volume, lanes, length, speed):
        """Calcula desempenho para rua sem semáforo"""
        # Capacidade para fluxo contínuo (maior)
        capacity = 2200 * lanes * min(1.0, 2.0 / length)
        
        # Throughput
        throughput = min(volume, capacity)
        
        # Delay mínimo mesmo sem semáforo
        base_delay = 2 + (volume / 1000)  # Delay aumenta com volume
        
        # Congestionamento
        congestion = max(0, (volume - throughput) / volume * 100) if volume > 0 else 0
        
        return {
            'throughput': throughput,
            'capacity': capacity,
            'delay_per_vehicle': base_delay,
            'total_delay': base_delay * volume,
            'congestion': congestion,
            'saturation': volume / capacity if capacity > 0 else 1,
            'has_traffic_light': False,
            'efficiency': (throughput / volume) * 100 if volume > 0 else 0
        }
    
    def _calculate_signal_delay(self, saturation, cycle_time, green_time, volume):
        """Calcula delay em semáforos usando fórmula do HCM"""
        red_time = cycle_time - green_time
        
        if saturation <= 0.1:
            return red_time / 2 + 2  # Delay mínimo
        
        elif saturation <= 0.8:
            # Tráfego normal - fórmula simplificada
            return red_time / 2 + (saturation * 15)
        
        elif saturation <= 0.95:
            # Tráfego saturado
            return red_time + ((saturation - 0.8) * 120)
        
        else:
            # Super saturado
            return red_time * 2 + ((saturation - 0.95) * 300)
    
    def _calculate_level_of_service(self, delay):
        """Calcula Nível de Serviço baseado no delay (HCM)"""
        if delay <= 10:
            return 'A'  # Fluxo livre
        elif delay <= 20:
            return 'B'  # Fluxo estável
        elif delay <= 35:
            return 'C'  # Fluxo estável mas com restrições
        elif delay <= 55:
            return 'D'  # Fluxo instável
        elif delay <= 80:
            return 'E'  # Capacidade
        else:
            return 'F'  # Congestionamento
    
    def _get_intersection_id(self, intersection):
        """Gera ID único para intersecção"""
        streets_str = '-'.join(str(street_id) for street_id in sorted(intersection['streets']))
        return f"intersection_{streets_str}"
    
    def evaluate_intersection_improvement(self, intersection, streets_before, streets_after):
        """Avalia melhoria após adição de semáforos"""
        sim_before = self.simulate_intersection_with_lights(intersection, streets_before)
        sim_after = self.simulate_intersection_with_lights(intersection, streets_after)
        
        delay_improvement = ((sim_before['average_delay'] - sim_after['average_delay']) / 
                           sim_before['average_delay'] * 100) if sim_before['average_delay'] > 0 else 0
        
        throughput_improvement = ((sim_after['total_throughput'] - sim_before['total_throughput']) / 
                                sim_before['total_throughput'] * 100) if sim_before['total_throughput'] > 0 else 0
        
        # Decisão baseada em múltiplos fatores
        if delay_improvement > 20 or throughput_improvement > 15:
            recommendation = "ALTAMENTE RECOMENDADO"
        elif delay_improvement > 10 or throughput_improvement > 8:
            recommendation = "RECOMENDADO"
        elif delay_improvement > 0:
            recommendation = "MARGINAL"
        else:
            recommendation = "NÃO RECOMENDADO"
        
        return {
            'delay_improvement': round(delay_improvement, 1),
            'throughput_improvement': round(throughput_improvement, 1),
            'recommendation': recommendation,
            'level_of_service_before': sim_before['level_of_service'],
            'level_of_service_after': sim_after['level_of_service'],
            'details': {
                'delay_antes': round(sim_before['average_delay'], 1),
                'delay_depois': round(sim_after['average_delay'], 1),
                'throughput_antes': round(sim_before['total_throughput'], 0),
                'throughput_depois': round(sim_after['total_throughput'], 0)
            }
        }