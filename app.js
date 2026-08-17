const surfConfig = {
    location: { name: "Malé", latitude: 4.169, longitude: 73.488 },
    preferredSwellDirection: 135, preferredSwellTolerance: 25,
    preferredMinimumPeriod: 10,
    preferredWindDirection: 270, preferredWindTolerance: 30,
    scoring: { swellDirection: 35, swellPeriod: 25, windDirection: 25, tide: 15 }
};

function getAngularDistance(target, actual) {
    let diff = Math.abs(target - actual) % 360;
    return diff > 180 ? 360 - diff : diff;
}

function degreesToCompass(degrees) {
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[Math.floor((degrees / 22.5) + 0.5) % 16];
}

function getRatingFromScore(score) {
    if (score >= 85) return { text: "Excellent", stars: "★★★★★", colorHex: "#10b981" };
    if (score >= 70) return { text: "Very Good", stars: "★★★★½", colorHex: "#34d399" };
    if (score >= 55) return { text: "Good", stars: "★★★★", colorHex: "#fbbf24" };
    if (score >= 40) return { text: "Fair", stars: "★★★", colorHex: "#fb923c" };
    return { text: "Poor", stars: "★★", colorHex: "#ef4444" };
}

function calculateSurfScore(forecast) {
    let breakdown = {};

    let swellDist = getAngularDistance(surfConfig.preferredSwellDirection, forecast.swell.direction);
    breakdown.swellDirection = swellDist <= surfConfig.preferredSwellTolerance ? 
        surfConfig.scoring.swellDirection : Math.max(0, surfConfig.scoring.swellDirection - ((swellDist - surfConfig.preferredSwellTolerance) / 90) * surfConfig.scoring.swellDirection);

    let p = forecast.swell.period;
    if (p >= 14) breakdown.swellPeriod = surfConfig.scoring.swellPeriod;
    else if (p >= 12) breakdown.swellPeriod = 22;
    else if (p >= 10) breakdown.swellPeriod = 18;
    else if (p >= 8) breakdown.swellPeriod = 10;
    else breakdown.swellPeriod = 0;

    let windDist = getAngularDistance(surfConfig.preferredWindDirection, forecast.wind.direction);
    breakdown.windDirection = windDist <= surfConfig.preferredWindTolerance ? 
        surfConfig.scoring.windDirection : Math.max(0, surfConfig.scoring.windDirection - ((windDist - surfConfig.preferredWindTolerance) / 120) * surfConfig.scoring.windDirection);
    if (forecast.wind.speed > 20) breakdown.windDirection *= 0.5;

    if (forecast.tide.stage === "High" || forecast.tide.stage === "Mid → High") breakdown.tide = 15;
    else if (forecast.tide.stage === "Mid") breakdown.tide = 10;
    else breakdown.tide = 5;

    let totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { score: Math.round(totalScore), breakdown, ratingInfo: getRatingFromScore(Math.round(totalScore)) };
}

function generateDescription(forecast, result) {
    const swellDir = degreesToCompass(forecast.swell.direction);
    const windDir = degreesToCompass(forecast.wind.direction);
    if (result.score >= 85) return `Excellent setup. A solid ${swellDir} swell with a long ${forecast.swell.period}-second period and favorable ${windDir} winds should produce clean waves.`;
    if (result.score >= 55) return `Decent conditions today. We have a ${swellDir} swell running at ${forecast.swell.period} seconds. Winds are ${windDir} at ${forecast.wind.speed}kt.`;
    return `Poor conditions. The swell is coming from ${swellDir} at only ${forecast.swell.period} seconds.`;
}

async function fetchForecastData() {
    // IMPORTANT: Replace this URL with your actual Render URL once you deploy the backend!
    const response = await fetch('https://surf-forecast-api.onrender.com/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: surfConfig.location.latitude, lon: surfConfig.location.longitude })
    });
    if (!response.ok) throw new Error('Network response failed');
    return await response.json();
}

async function initApp() {
    try {
        const rawData = await fetchForecastData();
        const currentResult = calculateSurfScore(rawData.current);
        const { score, ratingInfo } = currentResult;
        
        const dashboard = document.getElementById('main-dashboard');
        dashboard.classList.remove('skeleton');
        dashboard.innerHTML = `
            <div class="score-display" style="color: ${ratingInfo.colorHex}">${score}</div>
            <div class="rating-text" style="color: ${ratingInfo.colorHex}">${ratingInfo.text}</div>
            <div class="stars" style="color: ${ratingInfo.colorHex}">${ratingInfo.stars}</div>
            <div class="conditions-grid">
                <div class="condition-item"><span class="condition-label">Swell</span><span class="condition-value">${degreesToCompass(rawData.current.swell.direction)} ${rawData.current.swell.height}m @ ${rawData.current.swell.period}s</span></div>
                <div class="condition-item"><span class="condition-label">Wind</span><span class="condition-value">${degreesToCompass(rawData.current.wind.direction)} ${rawData.current.wind.speed}kt</span></div>
                <div class="condition-item"><span class="condition-label">Tide</span><span class="condition-value">${rawData.current.tide.stage}</span></div>
            </div>
            <div class="surf-summary">${generateDescription(rawData.current, currentResult)}</div>
        `;

        document.getElementById('hourly-timeline').innerHTML = rawData.hourly.map(hour => {
            const res = calculateSurfScore({ swell: hour.swell, wind: hour.wind, tide: hour.tide });
            return `<div class="mini-card" style="border-top-color: ${res.ratingInfo.colorHex}">
                <div class="mini-time">${hour.time}</div>
                <div class="mini-score" style="color: ${res.ratingInfo.colorHex}">${res.score}</div>
                <div class="mini-detail">${degreesToCompass(hour.swell.direction)} ${hour.swell.height}m</div>
            </div>`;
        }).join('');

        document.getElementById('weekly-forecast').innerHTML = rawData.weekly.map(day => {
            const res = calculateSurfScore({ swell: day.swell, wind: day.wind, tide: day.tide });
            return `<div class="mini-card weekly" style="border-top-color: ${res.ratingInfo.colorHex}">
                <div class="mini-time" style="font-weight:800">${day.day}</div>
                <div class="mini-score" style="color: ${res.ratingInfo.colorHex}">${res.score}</div>
                <div class="mini-detail">${degreesToCompass(day.swell.direction)} ${day.swell.height}m</div>
            </div>`;
        }).join('');
    } catch (error) {
        document.getElementById('main-dashboard').innerHTML = `<div style="color: var(--color-very-poor)"><h2>Forecast unavailable</h2><p>Please check your backend connection.</p></div>`;
    }
}

initApp();
