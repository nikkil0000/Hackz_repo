#include <HTTPClient.h>
#include <WiFi.h>

// ==========================================
// 1. NETWORK CONFIGURATION
// ==========================================
const char *ssid = "EFG";           // Replace with your WiFi Name
const char *password = "123456789"; // Replace with your WiFi Password

// ==========================================
// 2. SERVER CONFIGURATION
// ==========================================
// Server URL with your PC's IP address
const char *serverUrl = "http://10.175.23.246:3000/api/readings";

// ==========================================
// 3. PINS AND SENSORS (Example)
// ==========================================
// Define your actual sensor pins here
// const int sensorPin = 34;
int stepCount = 0; // Simulated step counter

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.println("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.print("Connected to WiFi network with IP Address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Check WiFi connection status
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;

    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    // ==========================================
    // 4. PREPARE DATA
    // ==========================================
    // Replace these static/random values with real sensor readings
    bool fallDetected = false; // digitalRead(FALL_SENSOR_PIN);
    int heartRate = random(60, 100);
    float sleepHours = 7.5;
    int spo2 = random(95, 100);

    // Simulate steps
    stepCount += random(0, 5);

    // Create JSON Payload
    String jsonPayload = "{";
    jsonPayload +=
        "\"fall_status\": " + String(fallDetected ? "true" : "false") + ",";
    jsonPayload += "\"heart_rate\": " + String(heartRate) + ",";
    jsonPayload += "\"step_count\": " + String(stepCount) + ",";
    jsonPayload += "\"sleep_hours\": " + String(sleepHours) + ",";
    jsonPayload += "\"spo2\": " + String(spo2) + ",";
    jsonPayload += "\"battery_level\": 85";
    jsonPayload += "}";

    // Send POST request
    Serial.println("Sending data: " + jsonPayload);
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Server Response: " + String(httpResponseCode));
      Serial.println(response);
    } else {
      Serial.print("Error on sending POST: ");
      Serial.println(httpResponseCode);
    }

    http.end(); // Free resources
  } else {
    Serial.println("WiFi Disconnected");
  }

  // Send data every 2 seconds
  delay(2000);
}
