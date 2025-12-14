
const axios = require('axios'); // Assuming axios is not there, will use http module to be safe or fetch
const http = require('http');

const data = JSON.stringify({
    fall_status: false,
    heart_rate: 75,
    spo2: 98,
    battery_level: 80
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/readings',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
