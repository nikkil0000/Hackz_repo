require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs'); // For file persistence

const crypto = require('crypto');
const axios = require('axios'); // For Telegram API
const db = require('./database'); // Database connection
const emailService = require('./emailService'); // Email Service

// Fast2SMS Configuration
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || 'YOUR_FAST2SMS_API_KEY_HERE';

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Function to send SMS using Fast2SMS
async function sendSMS(phoneNumber, message) {
    try {
        const https = require('https');

        const data = JSON.stringify({
            route: 'q',
            message: message,
            language: 'english',
            flash: 0,
            numbers: phoneNumber
        });

        const options = {
            hostname: 'www.fast2sms.com',
            port: 443,
            path: '/dev/bulkV2',
            method: 'POST',
            headers: {
                'authorization': FAST2SMS_API_KEY,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(responseData);
                        if (response.return) {
                            console.log('✅ SMS sent successfully:', response);
                            resolve(response);
                        } else {
                            console.error('❌ Fast2SMS API Error:', response.message, response);
                            // Don't reject, just log, so we don't crash main flow
                            resolve(response);
                        }
                    } catch (e) {
                        console.error('Error parsing SMS response:', e);
                        reject(e);
                    }
                });
            });

            req.on('error', (error) => {
                console.error('Error sending SMS:', error);
                reject(error);
            });

            req.write(data);
            req.end();
        });
    } catch (error) {
        console.error('SMS sending failed:', error);
        throw error;
    }
}

// Function to send Telegram Alert
async function sendTelegramAlert(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('⚠️ Telegram credentials missing. Skipping Telegram alert.');
        return;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });
        console.log('✅ Telegram alert sent successfully.');
    } catch (error) {
        console.error('❌ Failed to send Telegram alert:', error.message);
    }
}

// --- NATIVE AUTH IMPLEMENTATION (No external deps) ---
const SESSIONS = {}; // In-memory session store (simple token -> user mapping)

// 1. Password Hashing (using built-in crypto)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// 2. Cookie Parser Middleware
function simpleCookieParser(req, res, next) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
        rc.split(';').forEach(function (cookie) {
            var parts = cookie.split('=');
            list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
    }
    req.cookies = list;
    next();
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(simpleCookieParser); // Users our custom parser

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// --- AUTH ROUTES ---

// Signup
app.post('/api/signup', (req, res) => {
    const { name, email, password, role, phone, latitude, longitude, language, age } = req.body;

    // Hash password naturally
    const hashedPassword = hashPassword(password);

    db.createUser({
        name, email, password: hashedPassword, role, phone, latitude, longitude, language, age
    }, (err) => {
        if (err) {
            if (err.message && err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ message: 'User created' });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.getUserByEmail(email, (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

        const hashedInput = hashPassword(password);
        if (hashedInput !== user.password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate Simple Token
        const token = crypto.randomBytes(16).toString('hex');
        SESSIONS[token] = {
            id: user.id,
            role: user.role,
            name: user.name,
            phone: user.phone,
            language: user.language,
            latitude: user.latitude,
            longitude: user.longitude,
            expires: Date.now() + 3600000 // 1 hour
        };

        // Set Cookie
        res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; Path=/; Max-Age=3600`);
        res.json({ message: 'Logged in', user: { name: user.name, role: user.role, language: user.language } });
    });
});

// Check Auth Status (for frontend)
app.get('/api/auth/me', (req, res) => {
    const token = req.cookies['auth_token'];
    if (!token || !SESSIONS[token]) {
        return res.json({ authenticated: false });
    }

    const session = SESSIONS[token];
    if (Date.now() > session.expires) {
        delete SESSIONS[token];
        return res.json({ authenticated: false });
    }

    res.json({ authenticated: true, user: session });
});

// Logout
app.post('/api/logout', (req, res) => {
    const token = req.cookies['auth_token'];
    if (token) delete SESSIONS[token];

    res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; Path=/; Max-Age=0');
    res.json({ message: 'Logged out' });
});

// Store latest readings
let latestReadings = {
    fall_status: null,
    heart_rate: null,
    step_count: null,
    sleep_hours: null,
    spo2: null,
    battery_level: null,
    wifi_rssi: null,
    device_ip: '---',
    timestamp: new Date().toISOString()
};

let esp32Connected = false;
let connectionTimeout = null;
const CONNECTION_TIMEOUT_MS = 5000; // Increased to 5s to prevent flaky disconnects

let lastFallStatus = false; // Track previous fall status to avoid duplicate SMS
let lastKnownLocation = null; // Store last known location from any client

// Load last known location from file if exists
const DATA_FILE = path.join(__dirname, 'location-data.json');
try {
    if (fs.existsSync(DATA_FILE)) {
        lastKnownLocation = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        console.log('📍 Loaded stored location:', lastKnownLocation);
    }
} catch (err) {
    console.error('Failed to load location data:', err);
}

// Endpoint for ESP32 to send data
// Expected payload: { "fall_status": false, "heart_rate": 72, "sleep_hours": 6.5, "spo2": 98 }
app.post('/api/readings', async (req, res) => {
    console.log('📥 Data Received from ESP32:', req.body); // Debug Log
    const { fall_status, heart_rate, step_count, sleep_hours, spo2, battery_level, wifi_rssi, device_ip } = req.body;

    // Update latest readings with provided data
    if (fall_status !== undefined) latestReadings.fall_status = fall_status;
    if (heart_rate !== undefined) latestReadings.heart_rate = heart_rate;
    if (step_count !== undefined) latestReadings.step_count = step_count;
    if (sleep_hours !== undefined) latestReadings.sleep_hours = sleep_hours;
    if (spo2 !== undefined) latestReadings.spo2 = spo2;
    if (battery_level !== undefined) latestReadings.battery_level = battery_level;
    if (wifi_rssi !== undefined) latestReadings.wifi_rssi = wifi_rssi;
    if (device_ip !== undefined) latestReadings.device_ip = device_ip;
    latestReadings.timestamp = new Date().toISOString();

    // Handle Connection Status
    if (!esp32Connected) {
        esp32Connected = true;
        io.emit('device_status', { connected: true });
        console.log('ESP32 Connected');
    }

    // Reset timeout
    if (connectionTimeout) clearTimeout(connectionTimeout);
    connectionTimeout = setTimeout(() => {
        esp32Connected = false;
        io.emit('device_status', { connected: false });
        console.log('ESP32 Disconnected (Timeout)');
    }, CONNECTION_TIMEOUT_MS);

    console.log('Received readings:', latestReadings);

    // Send SMS Alert if Fall Detected (only on new fall detection)
    if (fall_status === true && lastFallStatus === false) {
        console.log('🚨 FALL DETECTED! Sending Alerts...');

        let alertMessage = `🚨 *URGENT ALERT* 🚨\n\nFall detected on ESP32 device!\nTime: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`;

        // Add Location if available
        if (lastKnownLocation) {
            const mapLink = `https://www.google.com/maps?q=${lastKnownLocation.latitude},${lastKnownLocation.longitude}`;
            alertMessage += `\n📍 *Last Known Location:*\n${mapLink}\n(Accuracy: ±${Math.round(lastKnownLocation.accuracy)}m)\n`;
        } else {
            alertMessage += `\n📍 Location: Unknown (No client connected)\n`;
        }

        alertMessage += `\nPlease check immediately!`;

        // 1. Send Telegram Alert
        await sendTelegramAlert(alertMessage); // Await this to ensure log order

        // 2. Send SMS to users
        // Get all logged-in users' phone numbers
        const phoneNumbers = Object.values(SESSIONS)
            .filter(session => session.phone && Date.now() < session.expires)
            .map(session => ({ phone: session.phone, name: session.name }));

        if (phoneNumbers.length > 0) {
            const smsMessage = `ALERT! Fall detected on ESP32 device at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. Please check immediately!`;

            // Send SMS to all registered users
            for (const user of phoneNumbers) {
                try {
                    await sendSMS(user.phone, smsMessage);
                    console.log(`✅ SMS sent to ${user.name} (${user.phone})`);
                } catch (error) {
                    console.error(`❌ Failed to send SMS to ${user.name} (${user.phone}):`, error.message);
                }
            }
        } else {
            console.log('⚠️ No logged-in users with phone numbers found for SMS');
        }
    }

    // Update last fall status
    if (fall_status !== undefined) {
        lastFallStatus = fall_status;
    }

    // Broadcast to all connected clients
    io.emit('reading_update', latestReadings);

    res.status(200).json({ message: 'Data received', data: latestReadings });
});

// NEW: Fall Detection specific endpoint for detailed data & Email Alerts
// Input: { deviceId, accX, accY, accZ, gyroX, gyroY, gyroZ, fallDetected, timestamp }
app.post('/api/fall-detection', async (req, res) => {
    console.log('🚨 Fall Detection Endpoint Hit:', req.body);
    const { fallDetected } = req.body;

    if (fallDetected) {
        // Prepare data with location
        const alertData = {
            ...req.body,
            location: lastKnownLocation // Inject cached location
        };

        // Trigger Email Alert
        const emailResult = await emailService.sendFallAlert(alertData);

        if (emailResult.success) {
            res.status(200).json({ status: 'success', message: 'Fall detected & Email sent', emailId: emailResult.messageId });
        } else {
            res.status(200).json({ status: 'success', message: 'Fall detected but Email failed/skipped', error: emailResult.message });
        }
    } else {
        console.log('ℹ️ Data received but no fall detected.');
        res.status(200).json({ status: 'success', message: 'Data logged, no fall detected' });
    }
});


// Socket.io connection handler
io.on('connection', (socket) => {
    console.log('New client connected');

    // Send only STATUS immediately upon connection.
    // DO NOT send old readings. Wait for fresh data.
    socket.emit('device_status', { connected: esp32Connected });

    // Optional: If connected, *then* maybe send last known? 
    // But user wants NO values if not connected.
    if (esp32Connected) {
        socket.emit('reading_update', latestReadings);
    }

    // Handle location capture events
    socket.on('location_captured', (data) => {
        console.log('Location captured:', data);
        lastKnownLocation = data; // Cache the location

        // Persist to file
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(data));
        } catch (err) {
            console.error('Failed to save location data:', err);
        }

        console.log(`  Coordinates: ${data.latitude}, ${data.longitude}`);
        console.log(`  Accuracy: ±${data.accuracy}m`);
        console.log(`  Timestamp: ${data.timestamp}`);
        // You can save this to a database or send alerts here
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
const IP_ADDRESS = '0.0.0.0'; // Listen on all interfaces

server.listen(PORT, IP_ADDRESS, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`To send data using curl:`);
    console.log(`curl -X POST -H "Content-Type: application/json" -d "{\\"fall_status\\":false, \\"heart_rate\\":72, \\"sleep_hours\\":6.5, \\"spo2\\":98}" http://127.0.0.1:${PORT}/api/readings`);
});
