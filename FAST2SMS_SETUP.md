# Fast2SMS Setup Instructions

## 📱 SMS Alert Feature

This dashboard now sends SMS alerts to registered users when a fall is detected!

## 🔧 Setup Steps

### 1. Get Fast2SMS API Key

1. Go to [Fast2SMS](https://www.fast2sms.com/)
2. Sign up or log in to your account
3. Navigate to **Dashboard** → **Dev API**
4. Copy your API key

### 2. Configure API Key

**Option 1: Using Environment Variable (Recommended)**
```bash
# Windows PowerShell
$env:FAST2SMS_API_KEY="your_api_key_here"

# Windows CMD
set FAST2SMS_API_KEY=your_api_key_here

# Linux/Mac
export FAST2SMS_API_KEY=your_api_key_here
```

**Option 2: Direct in server.js**
Open `server.js` and replace line 9:
```javascript
const FAST2SMS_API_KEY = 'YOUR_ACTUAL_API_KEY_HERE';
```

### 3. How It Works

1. **User Registration**: When users sign up, they provide their phone number
2. **Login**: Phone number is stored in the session
3. **Fall Detection**: When ESP32 sends `fall_status: true`:
   - Server detects the fall
   - SMS is sent to ALL logged-in users' phone numbers
   - Message includes timestamp and alert

### 4. SMS Message Format

```
ALERT! Fall detected on ESP32 device at [Date & Time]. Please check immediately!
```

### 5. Testing

**Test with curl:**
```bash
# First, make sure you're logged in on the dashboard
# Then simulate a fall:
curl -X POST -H "Content-Type: application/json" -d "{\"fall_status\":true, \"heart_rate\":72, \"sleep_hours\":6.5, \"spo2\":98}" http://127.0.0.1:3000/api/readings
```

**Check server console for:**
- 🚨 FALL DETECTED! Sending SMS alerts...
- ✅ SMS sent to [Name] ([Phone])

### 6. Important Notes

- SMS will only be sent when fall status changes from `false` to `true`
- Duplicate SMS alerts are prevented
- Only logged-in users with valid phone numbers receive SMS
- Check Fast2SMS dashboard for SMS credits and delivery status

### 7. Troubleshooting

**No SMS received?**
1. Check if API key is correctly set
2. Verify phone number format (should be 10 digits without country code)
3. Check Fast2SMS credits balance
4. Look at server console for error messages

**SMS format issues?**
- Fast2SMS supports Indian phone numbers (10 digits)
- Remove +91 or country code from phone number

## 📊 Server Logs

When a fall is detected, you'll see:
```
🚨 FALL DETECTED! Sending SMS alerts...
✅ SMS sent to John Doe (9876543210)
```

If no users are logged in:
```
⚠️ No logged-in users with phone numbers found
```

## 🔒 Security

- API key should be kept secret
- Use environment variables in production
- Don't commit `.env` file to git
