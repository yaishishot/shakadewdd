require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const msToKnots = (ms) => Math.round(ms * 1.94384);
const vectorToDegrees = (u, v) => Math.round((Math.atan2(-u, -v) * (180 / Math.PI) + 360) % 360);
const vectorToSpeed = (u, v) => Math.sqrt((u * u) + (v * v));
const formatTime = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const getDayAbbr = (isoString) => new Date(isoString).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

const getTideStage = (targetTimeStr, extremes) => {
    if (!extremes || extremes.length === 0) return "Mid";
    const targetTime = new Date(targetTimeStr).getTime();
    let prevExtreme = extremes[0], nextExtreme = extremes[extremes.length - 1];

    for (let i = 0; i < extremes.length - 1; i++) {
        if (targetTime >= new Date(extremes[i].time).getTime() && targetTime <= new Date(extremes[i+1].time).getTime()) {
            prevExtreme = extremes[i]; nextExtreme = extremes[i+1]; break;
        }
    }
    const hoursToNext = (new Date(nextExtreme.time).getTime() - targetTime) / 3600000;
    if (hoursToNext < 1.5) return nextExtreme.type === 'high' ? 'High' : 'Low';
    return prevExtreme.type === 'low' && nextExtreme.type === 'high' ? 'Mid → High' : 'Mid → Low';
};

app.post('/api/forecast', async (req, res) => {
    const lat = req.body.lat || 4.169;
    const lon = req.body.lon || 73.488;

    try {
        const startTimestamp = Math.floor(Date.now() / 1000);
        const endTimestamp = startTimestamp + (7 * 24 * 60 * 60);

        const [windyRes, tideRes] = await Promise.all([
            axios.post('https://api.windy.com/api/point-forecast/v2', {
                lat, lon, model: 'ecmwfWaves', parameters: ['wind_u', 'wind_v', 'swell1Height', 'swell1Period', 'swell1Dir']
            }, { headers: { 'Content-Type': 'application/json' } }),
            axios.get('https://api.stormglass.io/v2/tide/extremes/point', {
                params: { lat, lng: lon, start: startTimestamp, end: endTimestamp },
                headers: { 'Authorization': process.env.STORMGLASS_API_KEY }
            }).catch(() => ({ data: { data: [] } })) // Fallback if Stormglass fails
        ]);

        const weatherData = windyRes.data;
        const tideExtremes = tideRes.data.data;
        const timestamps = weatherData.ts; 
        let hourlyData = [];

        for (let i = 0; i < timestamps.length; i++) {
            const timeISO = new Date(timestamps[i]).toISOString();
            hourlyData.push({
                timestamp: timeISO, time: formatTime(timestamps[i]), day: getDayAbbr(timestamps[i]),
                swell: { height: Number(weatherData.swell1Height[i].toFixed(1)), period: Math.round(weatherData.swell1Period[i]), direction: Math.round(weatherData.swell1Dir[i]) },
                wind: { speed: msToKnots(vectorToSpeed(weatherData.wind_u[i], weatherData.wind_v[i])), direction: vectorToDegrees(weatherData.wind_u[i], weatherData.wind_v[i]) },
                tide: { stage: getTideStage(timeISO, tideExtremes) }
            });
        }

        res.json({
            current: hourlyData[0],
            hourly: hourlyData.slice(0, 24),
            weekly: hourlyData.filter(hour => hour.time === "12:00").slice(0, 7)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.listen(PORT, () => console.log(`API running on port ${PORT}`));
