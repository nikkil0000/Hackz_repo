require('dotenv').config();
const https = require('https');

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
const TEST_PHONE = '9113686287'; // Pavan KP

if (!FAST2SMS_API_KEY) {
    console.error('ERROR: FAST2SMS_API_KEY is missing in .env');
    process.exit(1);
}

console.log('Using API Key:', FAST2SMS_API_KEY ? '***HIDDEN***' : 'MISSING');
console.log('Sending test SMS to:', TEST_PHONE);

const data = JSON.stringify({
    route: 'q',
    message: 'Test SMS from ESP32 Dashboard Debugger. If you receive this, the API key is working.',
    language: 'english',
    flash: 0,
    numbers: TEST_PHONE
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

const req = https.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        console.log('Response Status:', res.statusCode);
        console.log('Response Body:', responseData);
        try {
            const parsed = JSON.parse(responseData);
            if (parsed.return) {
                console.log('SUCCESS: SMS request accepted.');
            } else {
                console.log('FAILURE: SMS request rejected.');
            }
        } catch (e) {
            console.log('Error parsing JSON:', e.message);
        }
    });
});

req.on('error', (error) => {
    console.error('Network Error:', error);
});

req.write(data);
req.end();
