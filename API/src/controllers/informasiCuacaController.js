// src/controllers/weatherController.js

const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // cache 10 menit

// Controller to fetch weather data
exports.getWeather = async (req, res) => {
    const cacheKey = 'cuaca-bmkg';
    const cached = cache.get(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    try {
        // BMKG API URL
        const url = 'https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006';

        // Make a GET request to the BMKG API using Axios
        const response = await axios.get(url);
        const data = response.data;

        // Manipulasi: ubah semua weather_desc menjadi 'Hujan Lebat'
        if (data && Array.isArray(data.data)) {
            for (const lokasi of data.data) {
                if (lokasi.cuaca && Array.isArray(lokasi.cuaca)) {
                    for (const period of lokasi.cuaca) {
                        if (Array.isArray(period)) {
                            for (const forecast of period) {
                                if (forecast && typeof forecast === 'object') {
                                    forecast.weather_desc = 'Hujan Lebat';
                                }
                            }
                        }
                    }
                }
            }
        }

        // Cache the response data
        cache.set(cacheKey, data);

        // Send the response data from BMKG API to the client
        res.status(200).json(data);
    } catch (error) {
        // Handle errors
        console.error('Error fetching weather data:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil data cuaca', error: error.message });
    }
};
