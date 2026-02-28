// Phase 4: OSRM, Heuristics, and I18N
// Android 17 Style / No Commercial APIs

const i18n = {
    en: {
        subtitle: "OSINT Geometry Tool",
        setup: "Setup",
        finishPoint: "Finish Point (Lat, Lng)",
        travelTime: "Travel Time (Minutes)",
        transportProfile: "Transport Profile",
        auto: "Auto",
        buggy: "Buggy",
        walk: "Walk",
        bike: "Bike",
        bus: "Bus",
        train: "Train",
        logistics: "Logistics & Factors",
        weatherImpact: "Weather Impact",
        weatherDesc: "Reduces speed by 20%",
        pitstopCalc: "Pit-stop Auto Calc",
        pitstopDesc: "+15 min every 3 hours",
        borderDelay: "Border Crossing Delay",
        borderDesc: "Adds 1 hour fixed delay",
        trafficHeuristic: "Traffic Heuristic",
        trafficDesc: "Simulates rush hours & delays",
        variance: "Heatmap & Variance",
        errorMargin: "General Error Margin",
        probHeatmap: "Probability Heatmap",
        heatmapDesc: "Intelligent node weighting (OSM)",
        initiateBreach: "Initiate Breach",
        logStatus: "SYS_STATUS: ANALYSIS_COMPLETE",
        logTime: "EFF_TRAVEL_TIME:",
        logRadius: "MAX_RADIUS_SPREAD:",
        logArea: "COVERED_AREA:",
        logTraffic: "TRAFFIC_HEURISTIC_PENALTY:",
        streetView: "Street View",
        export: "Export",
        reset: "Reset",
        analyzing: "Analyzing Graph Data...",
        errorMissingPoint: "Please select a point on the map first.",
        errorOsrm: "OSRM rate limit or routing error. Falling back to Cold Logic.",
        osrmFallback: "OSRM Fallback - Metric Routing via Cold Logic"
    },
    ru: {
        subtitle: "Инструмент гео-осинта",
        setup: "Настройка",
        finishPoint: "Точка финиша (Широта, Долгота)",
        travelTime: "Время в пути (Минуты)",
        transportProfile: "Профиль транспорта",
        auto: "Авто",
        buggy: "Багги",
        walk: "Пешком",
        bike: "Вело",
        bus: "Автобус",
        train: "Поезд",
        logistics: "Логистика и факторы",
        weatherImpact: "Влияние погоды",
        weatherDesc: "Снижает скорость на 20%",
        pitstopCalc: "Авторасчет пит-стопов",
        pitstopDesc: "15 мин на каждые 3 часа",
        borderDelay: "Задержка на границе",
        borderDesc: "Добавляет 1 час",
        trafficHeuristic: "Эвристика трафика",
        trafficDesc: "Симуляция часов пик и заторов",
        variance: "Тепловая карта и дисперсия",
        errorMargin: "Общая погрешность",
        probHeatmap: "Карта вероятностей",
        heatmapDesc: "Умный вес узлов (OSM)",
        initiateBreach: "Начать взлом",
        logStatus: "СИСТЕМА: АНАЛИЗ ЗАВЕРШЕН",
        logTime: "ЭФФЕКТИВНОЕ ВРЕМЯ:",
        logRadius: "МАКСИМАЛЬНЫЙ РАДИУС:",
        logArea: "ПЛОЩАДЬ ПОКРЫТИЯ:",
        logTraffic: "ШТРАФ ЭВРИСТИКИ ТРАФИКА:",
        streetView: "Просмотр улиц",
        export: "Экспорт",
        reset: "Сброс",
        analyzing: "Анализ данных графа...",
        errorMissingPoint: "Пожалуйста, выберите точку на карте.",
        errorOsrm: "Ошибка OSRM маршрутизации. Переход на Холодную Логику.",
        osrmFallback: "Запасной маршрут OSRM - Метрический расчет (Холодная Логика)"
    }
};

let currentLang = localStorage.getItem('radius_lang') || 'en';

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('radius_lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) {
            el.textContent = i18n[lang][key];
        }
    });

    document.getElementById('lang-en').checked = (lang === 'en');
    document.getElementById('lang-ru').checked = (lang === 'ru');
}

// Map Initialization
const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
}).setView([55.7558, 37.6173], 11);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
}).addTo(map);

L.control.zoom({ position: 'bottomleft' }).addTo(map);

// Data Layers
let markerLayer = L.layerGroup().addTo(map);
let isochroneLayer = L.layerGroup().addTo(map);
let heatLayer = null;

let isPickingLocation = false;

// Base Speeds (km/h)
const SPEEDS = {
    'driving-car': 70,
    'off-road': 35,
    'foot-walking': 5,
    'cycling-regular': 15,
    'transit': 25,
    'train': 60
};

// OSRM Profile Mapping
const OSRM_PROFILES = {
    'driving-car': 'car',
    'off-road': 'car',      // OSRM Public only supports car/bike/foot
    'foot-walking': 'foot',
    'cycling-regular': 'bike',
    'transit': 'car',       // Fallback
    'train': 'car'          // Fallback
};

document.addEventListener('DOMContentLoaded', () => {

    // Init Lang
    setLanguage(currentLang);

    document.getElementById('lang-en').addEventListener('change', () => setLanguage('en'));
    document.getElementById('lang-ru').addEventListener('change', () => setLanguage('ru'));

    const form = document.getElementById('analysis-form');
    const marginSlider = document.getElementById('error-margin');
    const marginVal = document.getElementById('margin-val');
    const pickLocBtn = document.getElementById('btn-pick-location');
    const coordsInput = document.getElementById('coordinates');
    const trafficToggle = document.getElementById('traffic-heuristic-toggle');
    const historicalTime = document.getElementById('historical-time');

    marginSlider.addEventListener('input', (e) => {
        marginVal.textContent = e.target.value + '%';
    });

    trafficToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            historicalTime.classList.remove('hidden');
            // Default to current time visually if empty
            if (!historicalTime.value) {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                historicalTime.value = now.toISOString().slice(0, 16);
            }
        } else {
            historicalTime.classList.add('hidden');
        }
    });

    pickLocBtn.addEventListener('click', () => {
        isPickingLocation = !isPickingLocation;
        if (isPickingLocation) {
            pickLocBtn.classList.add('active');
            pickLocBtn.style.color = 'var(--md-sys-color-primary)';
            document.body.style.cursor = 'crosshair';
        } else {
            pickLocBtn.classList.remove('active');
            pickLocBtn.style.color = '';
            document.body.style.cursor = 'default';
        }
    });

    map.on('click', (e) => {
        if (isPickingLocation) {
            const lat = e.latlng.lat.toFixed(6);
            const lng = e.latlng.lng.toFixed(6);
            coordsInput.value = `${lat}, ${lng}`;

            markerLayer.clearLayers();
            L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: 'var(--md-sys-color-error)',
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).addTo(markerLayer);

            isPickingLocation = false;
            pickLocBtn.classList.remove('active');
            pickLocBtn.style.color = '';
            document.body.style.cursor = 'default';
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        runAnalysis();
    });

    document.getElementById('btn-clear').addEventListener('click', clearMap);
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-streetview').addEventListener('click', openStreetView);

    // Initial Marker state handler (if typed manually)
    coordsInput.addEventListener('change', () => {
        const parts = coordsInput.value.split(',').map(s => parseFloat(s.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            markerLayer.clearLayers();
            L.circleMarker(parts, {
                radius: 8, fillColor: 'var(--md-sys-color-error)', color: '#fff', weight: 2, opacity: 1, fillOpacity: 1
            }).addTo(markerLayer);
            map.panTo(parts);
        }
    });
});

function openStreetView() {
    const coordsStr = document.getElementById('coordinates').value;
    if (!coordsStr) return;
    const [lat, lng] = coordsStr.split(',').map(s => s.trim());
    window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
}

async function runAnalysis() {
    const coordsStr = document.getElementById('coordinates').value;
    if (!coordsStr) {
        alert(i18n[currentLang].errorMissingPoint);
        return;
    }

    const [lat, lng] = coordsStr.split(',').map(s => parseFloat(s.trim()));
    const timeMins = parseInt(document.getElementById('travel-time').value);
    const transport = document.querySelector('input[name="transport"]:checked').value;
    const errorMargin = parseInt(document.getElementById('error-margin').value);
    const showHeatmap = document.getElementById('heatmap-toggle').checked;

    const opts = {
        weather: document.getElementById('weather-toggle').checked,
        pitStops: document.getElementById('pitstop-toggle').checked,
        borders: document.getElementById('border-toggle').checked,
        traffic: document.getElementById('traffic-heuristic-toggle').checked,
        histTime: document.getElementById('historical-time').value
    };

    document.getElementById('map-loading').classList.remove('hidden');
    document.getElementById('results-panel').classList.add('hidden');

    // Use OSRM Public Engine Strategy
    await generateOsrmIsochrone([lat, lng], timeMins, transport, errorMargin, showHeatmap, opts);
}

/**
 * Traffic Heuristic Engine
 * Simulates rush hour penalties based on time of day and day of week.
 */
function calculateTrafficPenalty(timeStr) {
    let dateObj = timeStr ? new Date(timeStr) : new Date();
    const day = dateObj.getDay(); // 0 is Sunday
    const hours = dateObj.getHours();
    const mins = dateObj.getMinutes();
    const decimalHours = hours + (mins / 60);

    let penalty = 1.0; // 1.0 means full speed

    if (day === 0 || day === 6) {
        // Weekend: Lighter penalty, maybe slight slow down mid-day
        if (decimalHours >= 12 && decimalHours <= 16) penalty = 0.85;
        else penalty = 0.95;
    } else {
        // Weekday Rush Hours
        // Morning (07:30 - 09:30)
        if (decimalHours >= 7.5 && decimalHours <= 9.5) {
            penalty = 0.60; // 40% slower
        }
        // Evening (17:00 - 19:30)
        else if (decimalHours >= 17.0 && decimalHours <= 19.5) {
            penalty = 0.55; // 45% slower (evening traffic usually worse)
        }
        // Daytime lull
        else if (decimalHours > 9.5 && decimalHours < 17.0) {
            penalty = 0.80; // 20% slower than max
        }
        // Night
        else {
            penalty = 0.95; // Near max speed
        }
    }

    // Add minor variance (0-5%)
    penalty -= (Math.random() * 0.05);

    return Math.max(0.1, penalty); // Never drop below 10% speed
}

async function generateOsrmIsochrone(center, timeMins, transport, errorMargin, showHeatmap, opts) {
    clearMapLayers();

    // 1. Calculate Base Time Modifications
    let effectiveTimeMins = timeMins;
    if (opts.pitStops) {
        const cycles = Math.floor(timeMins / 180);
        effectiveTimeMins -= (cycles * 15);
    }
    if (opts.borders && effectiveTimeMins > 60) {
        effectiveTimeMins -= 60;
    }
    effectiveTimeMins = Math.max(0, effectiveTimeMins);

    let baseSpeed = SPEEDS[transport] || 60;

    let penaltyMultiplier = 1.0;
    if (opts.weather) penaltyMultiplier *= 0.8;

    let trafficLoss = 0;
    if (opts.traffic) {
        let heuristicPenalty = calculateTrafficPenalty(opts.histTime);
        penaltyMultiplier *= heuristicPenalty;
        trafficLoss = Math.round((1 - heuristicPenalty) * 100);
    }

    document.getElementById('res-traffic').textContent = `-${trafficLoss}%`;

    let finalSecsTarget = (effectiveTimeMins * 60) * penaltyMultiplier;

    // Increase target by error margin to simulate boundary search envelope
    let targetSecsWithVariance = finalSecsTarget * (1 + (errorMargin / 100));

    // Calculate maximum theoretical radius in KM
    // Speed (km/h) / 3600 (sec/h) * targetSecs
    let maxTheoreticalRadiusKm = (baseSpeed / 3600) * targetSecsWithVariance;
    if (transport === 'transit' || transport === 'train') {
        maxTheoreticalRadiusKm *= 1.5; // Trains go straight
    }

    // OSRM Radial Strategy
    const OSRM_URL = 'https://router.project-osrm.org/route/v1';
    const profile = OSRM_PROFILES[transport] || 'car';

    const numRays = 16;
    let polygonPoints = [];
    let usedFallback = false;

    // Center Turf Point
    const centerPt = turf.point([center[1], center[0]]);

    for (let i = 0; i < numRays; i++) {
        const angle = (360 / numRays) * i;
        // Project a point far away along the angle
        const destination = turf.destination(centerPt, maxTheoreticalRadiusKm * 1.5, angle, { units: 'kilometers' });
        const destCoords = destination.geometry.coordinates;

        const reqUrl = `${OSRM_URL}/${profile}/${center[1]},${center[0]};${destCoords[0]},${destCoords[1]}?overview=full&geometries=geojson`;

        try {
            const resp = await fetch(reqUrl);
            if (!resp.ok) throw new Error("OSRM limit reached");

            const data = await resp.json();
            if (data.code !== 'Ok') throw new Error("OSRM logic error");

            const routeLine = data.routes[0].geometry.coordinates;
            const totalDurationSecs = data.routes[0].duration;

            if (totalDurationSecs <= targetSecsWithVariance) {
                // If the whole route is shorter than our target time, take the end point
                polygonPoints.push(routeLine[routeLine.length - 1]);
            } else {
                // Interpolate along line (Simplified approach: take percentage of distance based on time ratio)
                const ratio = targetSecsWithVariance / totalDurationSecs;
                const line = turf.lineString(routeLine);
                const totalDist = turf.length(line, { units: 'kilometers' });
                const targetDist = totalDist * ratio;
                const reachPt = turf.along(line, targetDist, { units: 'kilometers' });
                polygonPoints.push(reachPt.geometry.coordinates);
            }

        } catch (e) {
            console.warn(`Ray ${i} failed. Using cold logic point.`, e);
            usedFallback = true;
            const fallbackDest = turf.destination(centerPt, maxTheoreticalRadiusKm, angle, { units: 'kilometers' });
            polygonPoints.push(fallbackDest.geometry.coordinates);
        }

        // Anti-DDoS sleep for public API
        await new Promise(r => setTimeout(r, 100));
    }

    // Close the polygon
    if (polygonPoints.length > 0) {
        polygonPoints.push(polygonPoints[0]);
    }

    if (usedFallback) {
        console.log(i18n[currentLang].osrmFallback);
    }

    const isochronePoly = turf.polygon([polygonPoints]);

    // Apply Variance smoothing (Convex Hull as a stylistic choice for OSINT blobs)
    let finalPoly = isochronePoly;
    if (numRays >= 8) {
        finalPoly = turf.convex(turf.featureCollection(polygonPoints.map(p => turf.point(p))));
    }

    L.geoJSON(finalPoly, {
        style: {
            color: 'var(--md-sys-color-primary)',
            weight: 2,
            fillColor: '#174BA1', // Deeper expressive fill
            fillOpacity: 0.15
        }
    }).addTo(isochroneLayer);

    const areaSqKm = turf.area(finalPoly) / 1e6;
    const bbox = turf.bbox(finalPoly);
    const approxRadius = turf.distance(turf.point([center[1], center[0]]), turf.point([bbox[0], bbox[1]]));

    document.getElementById('res-time').textContent = effectiveTimeMins.toFixed(0);
    document.getElementById('res-radius').textContent = approxRadius.toFixed(2);
    document.getElementById('res-area').textContent = areaSqKm.toFixed(0);

    const bounds = L.geoJSON(finalPoly).getBounds();
    map.fitBounds(bounds, { padding: [50, 50] });

    if (showHeatmap && typeof L.heatLayer !== 'undefined') {
        const heatPoints = await generateRealHeatmapPoints(center, approxRadius, finalPoly);
        heatLayer = L.heatLayer(heatPoints, {
            radius: 28,
            blur: 18,
            maxZoom: 14,
            gradient: {
                0.3: 'var(--md-sys-color-primary)',
                0.5: '#00FFCC', // Neon cyan
                0.7: '#FF0055', // Neon pink/error
                1.0: '#FF0000'
            }
        }).addTo(map);
    }

    document.getElementById('map-loading').classList.add('hidden');
    document.getElementById('results-panel').classList.remove('hidden');
}

async function generateRealHeatmapPoints(centerLatlng, radiusKm, boundsPolygon) {
    const points = [];
    const bbox = turf.bbox(boundsPolygon);
    const numPoints = 600 + Math.floor(radiusKm * 15);

    let hotNodes = [];

    // Phase 4: Expanded Overpass API (OSM)
    // Looking for Residential, Commercial, and Parking elements
    const query = `
        [out:json][timeout:15];
        (
          node["public_transport"="station"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          node["amenity"="cafe"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          node["amenity"="parking"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          way["landuse"="residential"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
          way["landuse"="commercial"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
        );
        out center limit 100;
    `;

    try {
        const req = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await req.json();

        if (data && data.elements) {
            data.elements.forEach(el => {
                let lat = el.lat || el.center.lat;
                let lon = el.lon || el.center.lon;

                // Weighting logic
                let tagWeight = 0.8;
                if (el.tags) {
                    if (el.tags.landuse === 'commercial') tagWeight = 1.2;
                    else if (el.tags.landuse === 'residential') tagWeight = 0.9;
                    else if (el.tags.amenity === 'parking') tagWeight = 1.0;
                }

                hotNodes.push({
                    lat: lat,
                    lng: lon,
                    weight: tagWeight + Math.random() * 0.3
                });
            });
        }
    } catch (e) {
        console.log("Overpass API limit/error, standard cold weights used.", e);
    }

    if (hotNodes.length === 0) {
        // Fallback cold generation
        for (let i = 0; i < 6; i++) {
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
                    if (nodeDist < (radiusKm * 0.35)) {
                        intensity += (node.weight * (1 - (nodeDist / (radiusKm * 0.35))));
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
    document.getElementById('results-panel').classList.add('hidden');
}

function exportData() {
    alert(i18n[currentLang].logStatus + " -> EXPORT (TODO)");
}
