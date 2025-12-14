const axios = require('axios');

const API_URL = 'http://localhost:3000/api/fall-detection';

const testPayload = {
    deviceId: "ESP32_TEST_DEVICE",
    accX: 2.5,
    accY: 0.2,
    accZ: 9.8,
    gyroX: 250,
    gyroY: 15,
    gyroZ: 5,
    fallDetected: true,
    timestamp: new Date().toISOString() // Server might use this or generate its own
};

console.log('Sending Fall Detection Alert simulation...');

axios.post(API_URL, testPayload)
    .then(response => {
        console.log('✅ Response Received:', response.status);
        console.log('📦 Data:', response.data);
    })
    .catch(error => {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Server responded with:', error.response.data);
        }
    });
