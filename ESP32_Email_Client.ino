#include <HTTPClient.h>
#include <WiFi.h>


const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";

// REPLACE with your computer's IP address (keep port 3000)
const char *serverUrl = "http://192.168.1.100:3000/api/fall-detection";

// Mock Sensor Data Variables
float ax = 0, ay = 0, az = 0;
float gx = 0, gy = 0, gz = 0;
bool fallDetected = false;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");
}

void loop() {
  // --- REPLACE THIS WITH YOUR REAL SENSOR LOGIC ---
  // For demonstration, we simulate a fall every 30 seconds

  // 1. Read Sensors (Simulated)
  ax = 3.5;
  ay = 0.5;
  az = 0.2; // High acceleration
  gx = 200;
  gy = 50;
  gz = 30;             // High rotation
  fallDetected = true; // Trigger!

  // 2. Send Alert if Fall Detected
  if (fallDetected) {
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(serverUrl);
      http.addHeader("Content-Type", "application/json");

      // Construct JSON payload manually
      String jsonPayload = "{";
      jsonPayload += "\"deviceId\": \"ESP32_Patient_Monitor\",";
      jsonPayload += "\"fallDetected\": true,";
      jsonPayload += "\"accX\": " + String(ax) + ",";
      jsonPayload += "\"accY\": " + String(ay) + ",";
      jsonPayload += "\"accZ\": " + String(az) + ",";
      jsonPayload += "\"gyroX\": " + String(gx) + ",";
      jsonPayload += "\"gyroY\": " + String(gy) + ",";
      jsonPayload += "\"gyroZ\": " + String(gz) + ",";
      jsonPayload += "\"timestamp\": \"2024-12-12 12:00:00\""; // Optional
      jsonPayload += "}";

      Serial.println("Sending Fall Alert: " + jsonPayload);

      int httpResponseCode = http.POST(jsonPayload);

      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("Server Response: " + String(httpResponseCode));
        Serial.println(response);
      } else {
        Serial.print("Error on sending POST: ");
        Serial.println(httpResponseCode);
      }
      http.end();
    }
  }

  // Wait before next check (to avoid spamming in this demo)
  delay(30000);
}
