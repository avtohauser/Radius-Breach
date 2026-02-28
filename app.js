// app.js
// Core Logic Engine for Radius Breach - Material You Edition

let map;
let markerLayer;
let isochroneLayer;
let heatLayer;

// Configure Transport Speeds (km/h) for the Cold Logic Engine
const TRANPORT_SPEEDS = {
    'driving-car': 60,
    'off-road': 25,
    'foot-walking': 5,
    'cycling-regular': 15,
    'transit': 25,
    'train': 80
};

// API Keys Configuration
const API_CONFIG = {
    ors: localStorage.getItem('api_ors') || '',
    tomtom: localStorage.getItem('api_tomtom') || ''
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
    setupSettingsModal();
});

function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView([55.7558, 37.6173], 11);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap & CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    isochroneLayer = L.layerGroup().addTo(map);

    map.on('click', function (e) {
        if (document.getElementById('btn-pick-location').classList.contains('active-pick')) {
            const lat = e.latlng.lat.toFixed(6);
            const lng = e.latlng.lng.toFixed(6);
            document.getElementById('coordinates').value = `${lat}, ${lng}`;

            const pickBtn = document.getElementById('btn-pick-location');
            pickBtn.classList.remove('active-pick');
            pickBtn.style.color = '';
            map.getContainer().style.cursor = '';

            setMarker(e.latlng.lat, e.latlng.lng);
        }
    });
}

function setupSettingsModal() {
    const dialog = document.getElementById('settings-dialog');
    const btnOpen = document.getElementById('btn-settings');
    const btnClose = document.getElementById('btn-close-settings');
    const btnSave = document.getElementById('btn-save-settings');

    // Fill existing keys
    document.getElementById('api-ors').value = API_CONFIG.ors;
    document.getElementById('api-tomtom').value = API_CONFIG.tomtom;

    btnOpen.addEventListener('click', () => dialog.showModal());
    btnClose.addEventListener('click', () => dialog.close());

    btnSave.addEventListener('click', () => {
        const orsKey = document.getElementById('api-ors').value.trim();
        const tomtomKey = document.getElementById('api-tomtom').value.trim();

        localStorage.setItem('api_ors', orsKey);
        localStorage.setItem('api_tomtom', tomtomKey);

        API_CONFIG.ors = orsKey;
        API_CONFIG.tomtom = tomtomKey;

        dialog.close();
    });
}

function setupEventListeners() {
    const pickBtn = document.getElementById('btn-pick-location');
    pickBtn.addEventListener('click', () => {
        pickBtn.classList.toggle('active-pick');
        if (pickBtn.classList.contains('active-pick')) {
            pickBtn.style.color = 'var(--md-sys-color-primary)';
            map.getContainer().style.cursor = 'crosshair';
        } else {
            pickBtn.style.color = '';
            map.getContainer().style.cursor = '';
        }
    });

    const coeffSlider = document.getElementById('error-margin');
    coeffSlider.addEventListener('input', (e) => {
        document.getElementById('margin-val').textContent = e.target.value + '%';
    });

    const form = document.getElementById('analysis-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        runAnalysis();
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
        clearMap();
        document.getElementById('results-panel').classList.add('hidden');
    });

    document.getElementById('btn-export').addEventListener('click', exportData);

    const trafficToggle = document.getElementById('traffic-api-toggle');
    const histTime = document.getElementById('historical-time');
    trafficToggle.addEventListener('change', (e) => {
        if (e.target.checked) histTime.classList.remove('hidden');
        else histTime.classList.add('hidden');
    });

    // Street view
    document.getElementById('btn-streetview').addEventListener('click', () => {
        const coordsStr = document.getElementById('coordinates').value;
        const coords = parseCoords(coordsStr);
        if (coords) {
            const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords[0]},${coords[1]}`;
            window.open(url, '_blank');
        } else {
            alert('Please select a valid finish point first.');
        }
    });

    // Bottom Sheet Drag Handle (Visual only for now)
    const handle = document.querySelector('.drag-handle');
    handle.addEventListener('click', () => {
        document.getElementById('results-panel').classList.add('hidden');
    });
}

function setMarker(lat, lng) {
    markerLayer.clearLayers();

    // Material Design Marker (Red Dot)
    const targetIcon = L.divIcon({
        className: 'target-marker',
        html: `<div style="width: 24px; height: 24px; border: 2px solid var(--md-sys-color-error); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 180, 171, 0.2); box-shadow: 0 0 15px rgba(255, 180, 171, 0.5);">
            <div style="width: 6px; height: 6px; background: var(--md-sys-color-error); border-radius: 50%;"></div>
        </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    L.marker([lat, lng], { icon: targetIcon }).addTo(markerLayer);
    map.flyTo([lat, lng], 13);
}

function parseCoords(coordStr) {
    const parts = coordStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts;
    return null;
}

function runAnalysis() {
    const coordsStr = document.getElementById('coordinates').value;
    const timeMins = parseFloat(document.getElementById('travel-time').value);
    const transport = document.querySelector('input[name="transport"]:checked').value;
    const errorMargin = parseFloat(document.getElementById('error-margin').value);

    const useHeatmap = document.getElementById('heatmap-toggle').checked;

    // Logistics
    const weatherImpact = document.getElementById('weather-toggle').checked;
    const pitStops = document.getElementById('pitstop-toggle').checked;
    const borders = document.getElementById('border-toggle').checked;
    const trafficAPI = document.getElementById('traffic-api-toggle').checked;
    const realAPI = document.getElementById('real-api-toggle').checked;

    const coords = parseCoords(coordsStr);
    if (!coords) {
        alert('Invalid coordinates format. Use "LAT, LNG"');
        return;
    }

    setMarker(coords[0], coords[1]);

    const loading = document.getElementById('map-loading');
    loading.classList.remove('hidden');

    // Real API Check
    if (realAPI && !API_CONFIG.ors) {
        alert("Real API Routing requires an OpenRouteService API key. Please add it in Settings.");
        document.getElementById('real-api-toggle').checked = false;
        loading.classList.add('hidden');
        return;
    }

    if (trafficAPI && !API_CONFIG.tomtom) {
        alert("Real Traffic API requires a TomTom API key. Please add it in Settings.");
        document.getElementById('traffic-api-toggle').checked = false;
        loading.classList.add('hidden');
        return;
    }

    // Simulate network delay / heavy calculation for effect
    const apiOptions = { weather: weatherImpact, pitStops: pitStops, borders: borders, traffic: trafficAPI };

    if (realAPI && API_CONFIG.ors) {
        fetchRealIsochrone(coords, timeMins, transport, errorMargin, useHeatmap, apiOptions);
    } else {
        setTimeout(() => {
            // Cold Logic is now the default when real API is off
            generateIsochrone(coords, timeMins, transport, errorMargin, useHeatmap, true, weatherImpact, pitStops, borders, trafficAPI);
            loading.classList.add('hidden');
            document.getElementById('results-panel').classList.remove('hidden');
        }, 1200);
    }
}

// Procedural Fallback Engine (ColdLogic)
function generateIsochrone(center, timeMins, transport, errorMargin, showHeatmap, useColdLogic, weatherImpact, pitStops, crossedBorder, simulatedTraffic) {
    clearMapLayers();

    // 1. Initial Logistics Deductions
    let effectiveTimeMins = timeMins;
    if (pitStops) {
        const cycles = Math.floor(timeMins / 180);
        effectiveTimeMins -= (cycles * 15);
    }
    if (crossedBorder && effectiveTimeMins > 60) {
        effectiveTimeMins -= 60;
    }
    effectiveTimeMins = Math.max(0, effectiveTimeMins);

    // 2. Max Radius
    let speedKmh = TRANPORT_SPEEDS[transport];
    if (weatherImpact) speedKmh *= 0.8;
    if (simulatedTraffic) {
        const trafHit = 0.7 + (Math.random() * 0.2);
        speedKmh *= trafHit;
    }

    let maxRadiusKm = (speedKmh / 60) * effectiveTimeMins;
    if (useColdLogic) maxRadiusKm = maxRadiusKm / 1.35; // Manhattan distance approx

    const varianceFactor = 1 + (errorMargin / 100);
    const finalRadiusKm = maxRadiusKm * varianceFactor;

    // Output stats
    document.getElementById('res-time').textContent = effectiveTimeMins.toFixed(0);
    document.getElementById('res-radius').textContent = finalRadiusKm.toFixed(2);
    document.getElementById('res-area').textContent = (Math.PI * Math.pow(finalRadiusKm, 2)).toFixed(0);

    // 3. Polygon
    const centerPoint = turf.point([center[1], center[0]]);
    const options = { steps: 64, units: 'kilometers' };
    let rawCircle = turf.circle(centerPoint, finalRadiusKm, options);

    const coords = rawCircle.geometry.coordinates[0];
    const morphedCoords = coords.map((coord, index) => {
        const angle = (index / (coords.length - 1)) * Math.PI * 2;
        const noise = (Math.sin(angle * 3) * Math.cos(angle * 5)) * 0.3;
        const distanceMultiplier = 1 - (useColdLogic ? Math.abs(noise) : Math.abs(noise) * 0.5);

        const bearing = turf.bearing(centerPoint, turf.point(coord));
        const newDist = finalRadiusKm * distanceMultiplier;
        const newPoint = turf.destination(centerPoint, newDist, bearing, options);
        return newPoint.geometry.coordinates;
    });

    morphedCoords[morphedCoords.length - 1] = morphedCoords[0];
    const isochronePolygon = turf.polygon([morphedCoords]);

    L.geoJSON(isochronePolygon, {
        style: {
            color: 'var(--md-sys-color-primary)',
            weight: 2,
            fillColor: 'var(--md-sys-color-primary-container)',
            fillOpacity: 0.15,
            dashArray: '8, 8'
        }
    }).addTo(isochroneLayer);

    const bounds = L.geoJSON(isochronePolygon).getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });

    if (showHeatmap && typeof L.heatLayer !== 'undefined') {
        const heatPoints = generateHeatmapPoints(center, finalRadiusKm, isochronePolygon);
        heatLayer = L.heatLayer(heatPoints, {
            radius: 25,
            blur: 15,
            maxZoom: 14,
            gradient: {
                0.2: 'var(--md-sys-color-primary)',
                0.4: 'cyan',
                0.6: 'var(--md-sys-color-error)',
                1.0: 'red'
            }
        }).addTo(map);
    }
}

function generateHeatmapPoints(centerLatlng, radiusKm, boundsPolygon) {
    const points = [];
    const bbox = turf.bbox(boundsPolygon);
    const numPoints = 600 + Math.floor(radiusKm * 10);

    const hotNodes = [];
    for (let i = 0; i < 3; i++) {
        hotNodes.push({
            lat: bbox[1] + Math.random() * (bbox[3] - bbox[1]),
            lng: bbox[0] + Math.random() * (bbox[2] - bbox[0]),
            weight: 0.5 + Math.random() * 0.5
        });
    }

    for (let i = 0; i < numPoints; i++) {
        const ptLng = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
        const ptLat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
        const pt = turf.point([ptLng, ptLat]);

        if (turf.booleanPointInPolygon(pt, boundsPolygon)) {
            const d = turf.distance(turf.point([centerLatlng[1], centerLatlng[0]]), pt, { units: 'kilometers' });
            let intensity = 1 - (d / radiusKm);

            for (const node of hotNodes) {
                const nodePt = turf.point([node.lng, node.lat]);
                if (turf.booleanPointInPolygon(nodePt, boundsPolygon)) {
                    const nodeDist = turf.distance(nodePt, pt, { units: 'kilometers' });
                    if (nodeDist < (radiusKm * 0.25)) {
                        intensity += (node.weight * (1 - (nodeDist / (radiusKm * 0.25))));
                    }
                }
            }
            intensity = Math.min(1, Math.max(0, intensity));
            points.push([ptLat, ptLng, intensity]);
        }
    }
    return points;
}

const ORS_PROFILES = {
    'driving-car': 'driving-car',
    'off-road': 'driving-car',
    'foot-walking': 'foot-walking',
    'cycling-regular': 'cycling-regular',
    'transit': 'driving-car',
    'train': 'driving-car'
};

async function fetchRealIsochrone(center, timeMins, transport, errorMargin, showHeatmap, opts) {
    clearMapLayers();

    let effectiveTimeMins = timeMins;
    if (opts.pitStops) {
        const cycles = Math.floor(timeMins / 180);
        effectiveTimeMins -= (cycles * 15);
    }
    if (opts.borders && effectiveTimeMins > 60) {
        effectiveTimeMins -= 60;
    }
    effectiveTimeMins = Math.max(0, effectiveTimeMins);

    let penalty = 1.0;
    if (opts.weather) penalty *= 0.8;
    if (opts.traffic) penalty *= (0.7 + (Math.random() * 0.2));

    let finalSecs = (effectiveTimeMins * 60) * penalty;
    finalSecs = finalSecs * (1 + (errorMargin / 100));

    const profile = ORS_PROFILES[transport] || 'driving-car';

    const body = {
        locations: [[center[1], center[0]]],
        range: [finalSecs],
        range_type: 'time'
    };

    try {
        const response = await fetch(`https://api.openrouteservice.org/v2/isochrones/${profile}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': API_CONFIG.ors
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`ORS API Error: ${response.status}`);
        const data = await response.json();

        const isochronePolygon = data.features[0].geometry;

        L.geoJSON(isochronePolygon, {
            style: {
                color: 'var(--md-sys-color-primary)',
                weight: 2,
                fillColor: 'var(--md-sys-color-primary-container)',
                fillOpacity: 0.15
            }
        }).addTo(isochroneLayer);

        const turfPoly = turf.polygon(isochronePolygon.coordinates);
        const areaSqKm = turf.area(turfPoly) / 1e6;

        const bbox = turf.bbox(turfPoly);
        const approxRadius = turf.distance(turf.point([center[1], center[0]]), turf.point([bbox[0], bbox[1]]));

        document.getElementById('res-time').textContent = effectiveTimeMins.toFixed(0);
        document.getElementById('res-radius').textContent = approxRadius.toFixed(2);
        document.getElementById('res-area').textContent = areaSqKm.toFixed(0);

        const bounds = L.geoJSON(isochronePolygon).getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });

        if (showHeatmap && typeof L.heatLayer !== 'undefined') {
            const heatPoints = await generateRealHeatmapPoints(center, approxRadius, turfPoly);
            heatLayer = L.heatLayer(heatPoints, {
                radius: 25,
                blur: 15,
                maxZoom: 14,
                gradient: {
                    0.2: 'var(--md-sys-color-primary)',
                    0.4: 'cyan',
                    0.6: 'var(--md-sys-color-error)',
                    1.0: 'red'
                }
            }).addTo(map);
        }

        document.getElementById('map-loading').classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        alert('Real API Routing failed (check ORS API key or limit). Falling back to cold logic.');
        generateIsochrone(center, timeMins, transport, errorMargin, showHeatmap, true, opts.weather, opts.pitStops, opts.borders, opts.traffic);
        document.getElementById('map-loading').classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');
    }
}

async function generateRealHeatmapPoints(centerLatlng, radiusKm, boundsPolygon) {
    const points = [];
    const bbox = turf.bbox(boundsPolygon);
    const numPoints = 600 + Math.floor(radiusKm * 10);

    let hotNodes = [];

    // Fetch POIs from Overpass API (OSM)
    const query = `
        [out:json][timeout:15];
        (
          node["public_transport"="station"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          node["amenity"="cafe"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          node["shop"="supermarket"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          node["highway"="motorway_junction"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
        );
        out body limit 50;
    `;

    try {
        const req = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await req.json();

        if (data && data.elements) {
            data.elements.forEach(el => {
                hotNodes.push({
                    lat: el.lat,
                    lng: el.lon,
                    weight: 0.8 + Math.random() * 0.4
                });
            });
        }
    } catch (e) {
        console.log("Overpass API limit/error, standard cold weights used.", e);
    }

    if (hotNodes.length === 0) {
        for (let i = 0; i < 4; i++) {
            hotNodes.push({
                lat: bbox[1] + Math.random() * (bbox[3] - bbox[1]),
                lng: bbox[0] + Math.random() * (bbox[2] - bbox[0]),
                weight: 0.5 + Math.random() * 0.5
            });
        }
    }

    for (let i = 0; i < numPoints; i++) {
        const ptLng = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
        const ptLat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
        const pt = turf.point([ptLng, ptLat]);

        if (turf.booleanPointInPolygon(pt, boundsPolygon)) {
            const d = turf.distance(turf.point([centerLatlng[1], centerLatlng[0]]), pt, { units: 'kilometers' });
            let intensity = 1 - (d / radiusKm);

            for (const node of hotNodes) {
                const nodePt = turf.point([node.lng, node.lat]);
                if (turf.booleanPointInPolygon(nodePt, boundsPolygon)) {
                    const nodeDist = turf.distance(nodePt, pt, { units: 'kilometers' });
                    if (nodeDist < (radiusKm * 0.3)) {
                        intensity += (node.weight * (1 - (nodeDist / (radiusKm * 0.3))));
                    }
                }
            }
            intensity = Math.min(1, Math.max(0, intensity));
            points.push([ptLat, ptLng, intensity]);
        }
    }
    return points;
}

function clearMapLayers() {
    isochroneLayer.clearLayers();
    if (heatLayer && map.hasLayer(heatLayer)) {
        map.removeLayer(heatLayer);
    }
}

function clearMap() {
    clearMapLayers();
    markerLayer.clearLayers();
    map.setView([55.7558, 37.6173], 11);
    document.getElementById('analysis-form').reset();
    document.getElementById('margin-val').textContent = document.getElementById('error-margin').value + '%';
    document.getElementById('historical-time').classList.add('hidden');
}

function exportData() {
    alert("Exporting JSON...");
}
