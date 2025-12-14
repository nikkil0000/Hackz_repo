const http = require('http');

function sendData(data) {
    const postData = JSON.stringify(data);

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/readings',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
            // console.log(`Status: ${res.statusCode} | Response: ${responseData}`);
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    // Write data to request body
    req.write(postData);
    req.end();
}

console.log('Starting ESP32 Simulation...');
console.log('Sending data every 2 seconds to http://localhost:3000/api/readings');

let heartRate = 70;
let sleepHours = 7.0;
let fallStatus = false;
let spo2 = 98;
let batteryLevel = 100;
let wifiRssi = -50;

setInterval(() => {
    // Random walk
    heartRate += (Math.random() - 0.5) * 5;
    sleepHours += 0; // Sleep hours usually stay constant during day, but let's just hold it or slowly increment if sleeping

    // Spo2 usually stable
    spo2 += (Math.random() - 0.5) * 1;

    // Simulate a fall randomly (very rare)
    fallStatus = Math.random() < 0.05;

    // Clamp values
    heartRate = Math.round(Math.max(40, Math.min(180, heartRate)));
    spo2 = Math.round(Math.max(90, Math.min(100, spo2)));

    // Simulate Battery Drain (slowly)
    if (Math.random() < 0.1) batteryLevel = Math.max(0, batteryLevel - 1);

    // Simulate WiFi RSSI fluctuation
    wifiRssi += Math.round((Math.random() - 0.5) * 5);
    wifiRssi = Math.max(-90, Math.min(-30, wifiRssi));

    const payload = {
        fall_status: fallStatus,
        heart_rate: heartRate,
        sleep_hours: parseFloat(sleepHours.toFixed(1)),
        spo2: spo2,
        battery_level: batteryLevel,
        wifi_rssi: wifiRssi,
        device_ip: '192.168.1.105'
    };

    console.log('Sending:', payload);
    sendData(payload);
}, 2000);
