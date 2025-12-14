const io = require('socket.io-client');
const axios = require('axios');

const SOCKET_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3000/api/fall-detection';

const socket = io(SOCKET_URL);

console.log('Connecting to socket...');

socket.on('connect', () => {
    console.log('✅ Socket connected');

    // 1. Simulate Location Capture
    const fakeLocation = {
        latitude: 12.9715987, // Bangalore
        longitude: 77.5945627,
        accuracy: 15,
        timestamp: new Date().toISOString()
    };

    console.log('📍 Sending Location Update:', fakeLocation);
    socket.emit('location_captured', fakeLocation);

    // Wait meant for server to process location (negligible time, but safe to wait a bit)
    setTimeout(() => {
        // 2. Simulate Fall Detection (triggering Email)
        const fallData = {
            deviceId: "ESP32_TEST_LOC",
            accX: 4.0, accY: 0.1, accZ: 0.5,
            gyroX: 180, gyroY: 20, gyroZ: 10,
            fallDetected: true,
            timestamp: new Date().toISOString()
        };

        console.log('🚨 Sending Fall Alert API Request...');
        axios.post(API_URL, fallData)
            .then(response => {
                console.log('✅ API Response:', response.data);
                socket.disconnect();
            })
            .catch(error => {
                console.error('❌ API Error:', error.message);
                if (error.response) console.error(error.response.data);
                socket.disconnect();
            });

    }, 2000);
});
