const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    debug: true, // Show detailed logs
    logger: true // Log to console
});

// Cooldown mechanism to prevent spamming
let lastEmailSentTime = 0;
const EMAIL_COOLDOWN_MS = 10 * 1000; // REDUCED TO 10 SECONDS FOR TESTING (was 2 mins)

/**
 * Sends a Fall Detection Alert Email
 * @param {Object} data - The sensor data object
 */
async function sendFallAlert(data) {
    const now = Date.now();

    if (now - lastEmailSentTime < EMAIL_COOLDOWN_MS) {
        console.log('⏳ Email cooldown active. Skipping alert.');
        return { success: false, message: 'Cooldown active' };
    }

    const { deviceId, timestamp, accX, accY, accZ, gyroX, gyroY, gyroZ, fallDetected, location } = data;

    let locationHtml = '';
    if (location && location.latitude && location.longitude) {
        const mapLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
        locationHtml = `
            <div style="margin-top: 20px; padding: 15px; background-color: #e3f2fd; border-radius: 5px; border: 1px solid #bbdefb;">
                <h3 style="margin-top: 0; color: #1565c0;">📍 Device Location</h3>
                <p><strong>Coordinates:</strong> ${location.latitude}, ${location.longitude}</p>
                <p><strong>Accuracy:</strong> ±${Math.round(location.accuracy || 0)}m</p>
                <a href="${mapLink}" style="display: inline-block; padding: 10px 15px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; font-weight: bold;">
                    View on Google Maps
                </a>
            </div>
        `;
    } else {
        locationHtml = `
            <div style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 5px; border: 1px solid #ddd;">
                <h3 style="margin-top: 0; color: #666;">📍 Location Unknown</h3>
                <p>No GPS data available from the dashboard client.</p>
            </div>
        `;
    }

    const mailOptions = {
        from: `"ESP32 Alert System" <${process.env.EMAIL_USER}>`,
        to: process.env.ALERT_EMAIL,
        subject: '🚨 Fall Detected – Immediate Attention Required',
        html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                <h2 style="color: #d32f2f; text-align: center;">🚨 FALL DETECTED! 🚨</h2>
                <p style="font-size: 16px;">
                    A fall has been detected on device <strong>${deviceId || 'Unknown'}</strong>.
                    <br>Please check on the user immediately.
                </p>

                ${locationHtml}
                
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">

                <h3>📊 Device Data Snapshot</h3>
                <p><strong>Time:</strong> ${timestamp || new Date().toLocaleString()}</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr style="background-color: #f9f9f9;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Sensor</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">X</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Y</th>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Z</th>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">Accelerometer</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${accX}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${accY}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${accZ}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd;">Gyroscope</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${gyroX}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${gyroY}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${gyroZ}</td>
                    </tr>
                </table>

                <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; border: 1px solid #ffeeba;">
                    <strong>⚠ Emergency Instructions:</strong>
                    <ul>
                        <li>Call the user to verify status.</li>
                        <li>If no response, visit the location or contact emergency services.</li>
                    </ul>
                </div>

                <p style="font-size: 12px; color: #777; text-align: center; margin-top: 30px;">
                    This is an automated message from your ESP32 Fall Detection System.
                </p>
            </div>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Alert Email Sent:', info.messageId);
        lastEmailSentTime = now;
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending email:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { sendFallAlert };
