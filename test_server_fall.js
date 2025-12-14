const http = require('http');

function sendReading(fallStatus) {
    const data = JSON.stringify({
        fall_status: fallStatus,
        heart_rate: 120,
        sleep_hours: 5,
        spo2: 95
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
        console.log(`Sent fall_status: ${fallStatus} -> Status: ${res.statusCode}`);
        res.resume();
    });

    req.on('error', (e) => {
        console.error(`Error sending ${fallStatus}: ${e.message}`);
    });

    req.write(data);
    req.end();
}

console.log('Resetting fall status to FALSE...');
sendReading(false);

setTimeout(() => {
    console.log('Triggering fall status TRUE...');
    sendReading(true);
}, 2000);
