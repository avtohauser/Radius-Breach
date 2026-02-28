// app.js
// Core Logic Engine for Radius Breach

let map;
let markerLayer;
let isochroneLayer;
let heatLayer;

// Configure Transport Speeds (km/h) for the Cold Logic Engine
const TRANPORT_SPEEDS = {
    'driving-car': 60, // avg speed including some stops
    'off-road': 25, // buggy/quad cross country
    'foot-walking': 5,
    'cycling-regular': 15,
    'transit': 25, // mixed modality avg
    'train': 80 // intercity/commuter train
};

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupEventListeners();
});

function initMap() {
    // Initialize map focused on Europe/Moscow by default, with dark theme base map
    map = L.map('map', {
        zoomControl: false // Move it custom or hide
    }).setView([55.7558, 37.6173], 11);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // CartoDB Dark Matter tile layer for the OSINT aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
    isochroneLayer = L.layerGroup().addTo(map);

    // Click on map to pick location
    map.on('click', function (e) {
        if (document.getElementById('btn-pick-location').classList.contains('active-pick')) {
            const lat = e.latlng.lat.toFixed(6);
            const lng = e.latlng.lng.toFixed(6);
            document.getElementById('coordinates').value = `${lat}, ${lng}`;
            document.getElementById('btn-pick-location').classList.remove('active-pick');
            document.getElementById('btn-pick-location').style.color = '';
            setMarker(e.latlng.lat, e.latlng.lng);
        }
    });
}

function setupEventListeners() {
    const pickBtn = document.getElementById('btn-pick-location');
    pickBtn.addEventListener('click', () => {
        pickBtn.classList.toggle('active-pick');
        if (pickBtn.classList.contains('active-pick')) {
            pickBtn.style.color = 'var(--accent)';
            map.getContainer().style.cursor = 'crosshair';
        } else {
            pickBtn.style.color = '';
            map.getContainer().style.cursor = '';
        }
    });

    const coeffSlider = document.getElementById('error-margin');
    coeffSlider.addEventListener('input', (e) => {
        document.getElementById('margin-val').textContent = e.target.value;
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
        if (e.target.checked) {
            histTime.classList.remove('hidden');
        } else {
            histTime.classList.add('hidden');
        }
    });

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
}

function setMarker(lat, lng) {
    markerLayer.clearLayers();

    // Custom Hacker Icon
    const targetIcon = L.divIcon({
        className: 'target-marker',
        html: `<div style="width: 20px; height: 20px; border: 2px solid var(--danger); border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(239, 68, 68, 0.2); box-shadow: 0 0 15px rgba(239,68,68, 0.5);">
            <div style="width: 4px; height: 4px; background: var(--danger); border-radius: 50%;"></div>
        </div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    L.marker([lat, lng], { icon: targetIcon }).addTo(markerLayer);
    map.flyTo([lat, lng], 13);
}

function parseCoords(coordStr) {
    const parts = coordStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts;
    }
    return null;
}

function runAnalysis() {
    const coordsStr = document.getElementById('coordinates').value;
    const timeMins = parseFloat(document.getElementById('travel-time').value);
    const transport = document.querySelector('input[name="transport"]:checked').value;
    const errorMargin = parseFloat(document.getElementById('error-margin').value);

    const useHeatmap = document.getElementById('heatmap-toggle').checked;
    const useColdLogic = document.getElementById('cold-logic-toggle').checked;

    const weatherImpact = document.getElementById('weather-toggle').checked;
    const pitStops = document.getElementById('pitstop-toggle').checked;
    const borders = document.getElementById('border-toggle').checked;
    const trafficAPI = document.getElementById('traffic-api-toggle').checked;

    const coords = parseCoords(coordsStr);
    if (!coords) {
        alert('Invalid coordinates format. Use "LAT, LNG"');
        return;
    }

    setMarker(coords[0], coords[1]);

    const loading = document.getElementById('map-loading');
    loading.classList.remove('hidden');

    // Simulate network delay / heavy calculation for effect
    setTimeout(() => {
        generateIsochrone(coords, timeMins, transport, errorMargin, useHeatmap, useColdLogic, weatherImpact, pitStops, borders, trafficAPI);
        loading.classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');
    }, 1200);
}

/**
 * Generate a procedural "blob" and heatmap instead of relying on a paid backend API.
 * This simulates a realistic road-network bounding box by applying fractal noise to a circle based on transport profile.
 */
function generateIsochrone(center, timeMins, transport, errorMargin, showHeatmap, useColdLogic, weatherImpact, pitStops, crossedBorder, simulatedTraffic) {
    clearMapLayers();

    // 1. Initial Logistics Deductions (Human Factor)
    let effectiveTimeMins = timeMins;

    if (pitStops) {
        // -15 mins per 3 hours (180 mins)
        const cycles = Math.floor(timeMins / 180);
        effectiveTimeMins -= (cycles * 15);
    }

    if (crossedBorder && effectiveTimeMins > 60) {
        // fixed 1 hour delay if checking border
        effectiveTimeMins -= 60;
    }

    effectiveTimeMins = Math.max(0, effectiveTimeMins);

    // 2. Calculate Theoretical Max Radius (km) + Speed Adjustments
    let speedKmh = TRANPORT_SPEEDS[transport];

    if (weatherImpact) speedKmh *= 0.8;

    if (simulatedTraffic) {
        // Random variance to simulate live traffic hit (10-30% reduction)
        const trafHit = 0.7 + (Math.random() * 0.2);
        speedKmh *= trafHit;
    }

    let maxRadiusKm = (speedKmh / 60) * effectiveTimeMins;

    // Cold logic reduces the absolute max radius to account for realistic grid layouts (Manhattan distance / road curves)
    // usually road distance is ~1.3 to 1.4 times straight line distance
    if (useColdLogic) {
        maxRadiusKm = maxRadiusKm / 1.35;
    }

    // Add error margin variance
    const varianceFactor = 1 + (errorMargin / 100);
    const finalRadiusKm = maxRadiusKm * varianceFactor;

    // Output stats
    document.getElementById('res-time').textContent = effectiveTimeMins.toFixed(0);
    document.getElementById('res-radius').textContent = finalRadiusKm.toFixed(2) + ' km';
    document.getElementById('res-area').textContent = (Math.PI * Math.pow(finalRadiusKm, 2)).toFixed(2) + ' km²';

    // 2. Generate a morphed polygon using Turf.js to simulate a road graph reachability blob
    const centerPoint = turf.point([center[1], center[0]]); // Turf uses [lng, lat]
    const options = { steps: 64, units: 'kilometers' };

    // Base circle
    let rawCircle = turf.circle(centerPoint, finalRadiusKm, options);

    // Morph the circle into a blob
    const coords = rawCircle.geometry.coordinates[0];
    const morphedCoords = coords.map((coord, index) => {
        // Base noise on the angle (0 to 2PI) so it wraps around perfectly
        const angle = (index / (coords.length - 1)) * Math.PI * 2;
        const noise = (Math.sin(angle * 3) * Math.cos(angle * 5)) * 0.3;
        const distanceMultiplier = 1 - (useColdLogic ? Math.abs(noise) : Math.abs(noise) * 0.5);

        // Calculate point at new distance from center
        const bearing = turf.bearing(centerPoint, turf.point(coord));
        const newDist = finalRadiusKm * distanceMultiplier;
        const newPoint = turf.destination(centerPoint, newDist, bearing, options);
        return newPoint.geometry.coordinates;
    });

    // Ensure first and last coordinates match exactly
    morphedCoords[morphedCoords.length - 1] = morphedCoords[0];

    const isochronePolygon = turf.polygon([morphedCoords]);

    // Render Blob
    L.geoJSON(isochronePolygon, {
        style: {
            color: 'var(--accent)',
            weight: 2,
            fillColor: 'var(--accent)',
            fillOpacity: 0.15,
            dashArray: '5, 10'
        }
    }).addTo(isochroneLayer);

    // Fit map bounds
    const bounds = L.geoJSON(isochronePolygon).getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });

    // 3. Render Probability Heatmap if toggled
    if (showHeatmap && typeof L.heatLayer !== 'undefined') {
        const heatPoints = generateHeatmapPoints(center, finalRadiusKm, isochronePolygon);
        heatLayer = L.heatLayer(heatPoints, {
            radius: 25,
            blur: 15,
            maxZoom: 14,
            gradient: {
                0.2: 'blue', 0.4: 'cyan', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red'
            }
        }).addTo(map);
    }
}

/**
 * Generate points inside the polygon with varying intensity based on distance to center.
 * Simulates higher probability closer to the finish point and along "valleys".
 */
function generateHeatmapPoints(centerLatlng, radiusKm, boundsPolygon) {
    const points = [];
    const bbox = turf.bbox(boundsPolygon); // [minX, minY, maxX, maxY]
    const numPoints = 600 + Math.floor(radiusKm * 10); // scale points with area

    // Simulate "Node Weighting" by creating 2-3 artificial density centroids (POIs like hubs/airports) within bounds
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
            // Distance inverse probability
            const d = turf.distance(turf.point([centerLatlng[1], centerLatlng[0]]), pt, { units: 'kilometers' });
            // Isochrone Decay: Closer = higher intent, farther = lower
            let intensity = 1 - (d / radiusKm);

            // Apply Node Weighting Boost
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

            // Add point: [lat, lng, intensity]
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
    document.getElementById('margin-val').textContent = document.getElementById('error-margin').value;
}

function exportData() {
    // Generate a simulated GeoJSON export
    alert("Exporting simulated GeoJSON of Isochrone Boundary...");
}
