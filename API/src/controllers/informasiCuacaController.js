// src/controllers/weatherController.js

const axios = require('axios');

// Controller to fetch weather data
exports.getWeather = async (req, res) => {
    try {
        // BMKG API URL
        const url = 'https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=32.04.12.2006';

        // Make a GET request to the BMKG API using Axios
        const response = await axios.get(url);

        // Send the response data from BMKG API to the client
        res.json(response.data);
    } catch (error) {
        // Handle errors
        console.error('Error fetching weather data:', error);
        res.status(500).json({ error: 'Unable to fetch weather data' });
    }
};
