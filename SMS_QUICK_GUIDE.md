# 📱 SMS Alert System - Quick Guide

## How It Works

```
┌─────────────────┐
│   ESP32 Device  │
│  (Fall Sensor)  │
└────────┬────────┘
         │ Sends fall_status: true
         ▼
┌─────────────────────────┐
│   Node.js Server        │
│  - Detects fall         │
│  - Gets logged-in users │
│  - Sends SMS via API    │
└────────┬────────────────┘
         │
         ├──────────────────┐
         ▼                  ▼
┌──────────────┐   ┌──────────────┐
│  Fast2SMS    │   │  Dashboard   │
│  API Service │   │  (Browser)   │
└──────┬───────┘   └──────────────┘
       │
       ▼
┌──────────────┐
│ User's Phone │
│ Receives SMS │
└──────────────┘
```

## Setup Checklist

- [ ] Get Fast2SMS API key from https://www.fast2sms.com/dashboard/dev-api
- [ ] Set API key in server.js (line 9) or as environment variable
- [ ] Ensure users register with valid 10-digit phone numbers
- [ ] Login to dashboard (phone number stored in session)
- [ ] Test fall detection
- [ ] Check server console for SMS confirmation

## Phone Number Format

✅ **Correct**: `9876543210` (10 digits, no country code)
❌ **Wrong**: `+919876543210`, `919876543210`, `+91 9876543210`

## Testing Commands

### 1. Simulate Fall Detection
```bash
curl -X POST -H "Content-Type: application/json" -d "{\"fall_status\":true, \"heart_rate\":72, \"sleep_hours\":6.5, \"spo2\":98}" http://127.0.0.1:3000/api/readings
```

### 2. Reset to Safe
```bash
curl -X POST -H "Content-Type: application/json" -d "{\"fall_status\":false, \"heart_rate\":75, \"sleep_hours\":7, \"spo2\":98}" http://127.0.0.1:3000/api/readings
```

## Expected Server Output

When fall is detected:
```
Received readings: { fall_status: true, heart_rate: 72, ... }
🚨 FALL DETECTED! Sending SMS alerts...
✅ SMS sent to John Doe (9876543210)
```

## SMS Message Example

```
ALERT! Fall detected on ESP32 device at 09/12/2025, 10:30:45 PM. Please check immediately!
```

## Important Notes

1. **SMS Credits**: Check your Fast2SMS account for available credits
2. **Rate Limits**: Fast2SMS has rate limits, check their documentation
3. **Indian Numbers Only**: Fast2SMS primarily works with Indian phone numbers
4. **Session Required**: User must be logged in to receive SMS
5. **No Duplicates**: SMS sent only when fall status changes from false → true

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No SMS received | Check API key, phone format, and Fast2SMS credits |
| "No logged-in users" message | Login to dashboard first |
| SMS to wrong number | Check phone number in users.json |
| API error | Verify API key is active on Fast2SMS dashboard |

## Next Steps

1. **Add to .gitignore**: Add `.env` to prevent API key exposure
2. **Database Storage**: Consider storing SMS logs in database
3. **Multiple Recipients**: Add emergency contacts feature
4. **SMS Templates**: Customize messages for different alert types
