const io = require('socket.io-client');
const http = require('http');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('socket connected');

    // Simulate Browser Sending Location
    const locationData = {
        latitude: 12.9716, // Bangalore coordinates
        longitude: 77.5946,
        accuracy: 15,
        timestamp: new Date().getTime()
    };

    console.log('Sending location:', locationData);
    socket.emit('location_captured', locationData);

    // Wait for server to cache it, then trigger fall
    setTimeout(() => {
        triggerFall();
    }, 1000);
});

function triggerFall() {
    const data = JSON.stringify({
        fall_status: true,
        heart_rate: 130,
        spo2: 92
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

    console.log('Sending POST /api/readings with fall_status: true...');
    const req = http.request(options, (res) => {
        console.log(`Response Status: ${res.statusCode}`);
        res.on('data', d => process.stdout.write(d));

        socket.disconnect();
        process.exit(0); // Exit after sending
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        socket.disconnect();
    });

    req.write(data);
    req.end();
}
