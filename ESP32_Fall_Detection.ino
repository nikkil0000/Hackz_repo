/*
 * PROJECT: Smart Guardian - Final Integrated Firmware
 * HARDWARE: TTGO T-Display (ESP32), MPU6050/6500, MAX30102
 * LIBRARIES: bfs::Mpu6500, SparkFun MAX3010x, TFT_eSPI
 */

#include "MAX30105.h"
#include "mpu6500.h" // Bolder Flight Systems Library
#include "spo2_algorithm.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <WiFi.h>
#include <Wire.h>

// ================= CONFIGURATION =================
// WiFi
const char *ssid = "EFG";
const char *password = "123456789";
const char *serverUrl = "http://10.175.23.246:3000/api/readings"; // UPDATED IP
const char *deviceId = "TTGO-T-Display-001";

// Pins
#define SDA_PIN 21
#define SCL_PIN 22

// Thresholds
const float FALL_TRIGGER = 25.0; // Impact G-force (m/s^2)
const float STEP_THRESHOLD = 1.5;
const float SLEEP_VARIANCE = 0.05;

// HR Measurement Config
const unsigned long MEASURE_DURATION = 60000; // 60 Seconds

// ================= OBJECTS & VARIABLES =================
TFT_eSPI tft = TFT_eSPI();
MAX30105 particleSensor;
bfs::Mpu6500 imu; // Using MPU6500 object

// --- Motion Variables ---
float currentSVM = 0;
float dynamicAccel = 0;
bool fallDetected = false;
int stepCount = 0;
String sleepState = "Awake";
float motionVariance = 0;

// --- Heart Rate & SpO2 Variables ---
uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t bufferLength = 100;
int32_t spo2;
int8_t validSPO2;
int32_t heartRate;
int8_t validHeartRate;

// Measurement State Machine
enum HRState { IDLE, MEASURING, RESULT };
HRState hrState = IDLE;
unsigned long hrTimerStart = 0;
int last5BPM[5] = {0};
int bpmIndex = 0;
int finalAvgBPM = 0;
int displayBPM = 0;
int displaySpO2 = 0;
int samplesRecorded = 0;

// --- Web Server Timer ---
unsigned long lastWebSend = 0;

// --- Graphics ---
const unsigned char PROGMEM heart_bmp[] = {
    0x00, 0x00, 0x18, 0x18, 0x3C, 0x3C, 0x7E, 0x7E, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x7E, 0x7E, 0x3C, 0x3C, 0x18, 0x18,
    0x08, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  // 1. Init Display
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("Booting System...", 10, 10, 2);

  // 2. Init WiFi
  WiFi.begin(ssid, password);
  tft.drawString("Connecting WiFi...", 10, 30, 2);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 15) {
    delay(500);
    retry++;
    Serial.print(".");
  }

  // 3. Init Wire
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  // 4. Init MPU6500 (BFS Library)
  imu.Config(&Wire, bfs::Mpu6500::I2C_ADDR_PRIM); // Address 0x68
  if (!imu.Begin()) {
    Serial.println("MPU Fail");
    tft.fillScreen(TFT_RED);
    tft.drawString("MPU Fail!", 40, 60, 4);
  }
  imu.ConfigSrd(19); // Set sample rate

  // 5. Init MAX30102
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 Fail");
    tft.fillScreen(TFT_RED);
    tft.drawString("MAX Fail!", 40, 60, 4);
  }

  // Configure MAX30102
  byte ledBrightness = 60;
  byte sampleAverage = 4;
  byte ledMode = 2; // Red + IR (Required for SpO2)
  int sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 4096;
  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate,
                       pulseWidth, adcRange);

  // Ready UI
  tft.fillScreen(TFT_BLACK);
  drawStaticUI();
}

// ================= MAIN LOOP =================
void loop() {
  // --- 1. MOTION PROCESSING ---
  processMotion();

  // --- 2. HEART RATE & SPO2 LOGIC ---
  processHeartRate();

  // --- 3. WEB SERVER (Every 2s) ---
  if (millis() - lastWebSend > 2000) {
    sendDataToServer();
    lastWebSend = millis();
  }

  // --- 4. SERIAL PLOTTER ---
  Serial.print("SVM:");
  Serial.print(currentSVM);
  Serial.print(",");
  Serial.print("Steps:");
  Serial.print(stepCount * 2);
  Serial.print(",");
  Serial.print("HR_Raw:");
  Serial.print(particleSensor.getIR());
  Serial.print(",");
  Serial.print("BPM:");
  Serial.print(displayBPM);
  Serial.print(",");
  Serial.print("SpO2:");
  Serial.print(displaySpO2);
  Serial.print(",");
  Serial.println();
}

// ================= LOGIC FUNCTIONS =================

void processMotion() {
  if (imu.Read()) {
    // Get Data in m/s^2
    float ax = imu.accel_x_mps2();
    float ay = imu.accel_y_mps2();
    float az = imu.accel_z_mps2();

    // SVM Calculation
    currentSVM = sqrt(sq(ax) + sq(ay) + sq(az));
    dynamicAccel = currentSVM - 9.8;

    // Fall Logic
    if (currentSVM > FALL_TRIGGER) {
      fallDetected = true;
      showFallAlert();
    }

    // Step Logic
    static bool stepFlag = false;
    if (dynamicAccel > STEP_THRESHOLD && !stepFlag) {
      stepCount++;
      stepFlag = true;
      updateStepUI();
    } else if (dynamicAccel < 0.5) {
      stepFlag = false;
    }

    // Sleep Logic (Variance)
    static float lastVarSVM = 0;
    float delta = abs(currentSVM - lastVarSVM);
    motionVariance = (motionVariance * 0.95) + (delta * 0.05);
    lastVarSVM = currentSVM;

    if (motionVariance < SLEEP_VARIANCE)
      sleepState = "Sleep";
    else
      sleepState = "Awake";
  }
}

void processHeartRate() {
  particleSensor.check();

  while (particleSensor.available()) {
    if (samplesRecorded >= 100) {
      for (int i = 0; i < 99; i++) {
        redBuffer[i] = redBuffer[i + 1];
        irBuffer[i] = irBuffer[i + 1];
      }
      samplesRecorded = 99;
    }
    redBuffer[samplesRecorded] = particleSensor.getFIFORed();
    irBuffer[samplesRecorded] = particleSensor.getFIFOIR();
    samplesRecorded++;
    particleSensor.nextSample();
  }

  long irValue = particleSensor.getIR();

  switch (hrState) {
  case IDLE:
    if (irValue > 50000) {
      hrState = MEASURING;
      hrTimerStart = millis();
      tft.fillRect(0, 40, 240, 90, TFT_BLACK);
      tft.setTextColor(TFT_YELLOW, TFT_BLACK);
      tft.drawString("Calibrating...", 60, 50, 2);
      samplesRecorded = 0;
    } else {
      static long lastBlink = 0;
      if (millis() - lastBlink > 1000) {
        tft.fillRect(0, 40, 240, 90, TFT_BLACK);
        tft.setTextColor(TFT_ORANGE, TFT_BLACK);
        tft.drawString("Place Finger", 60, 60, 2);
        lastBlink = millis();
      }
    }
    break;

  case MEASURING: {
    if (irValue < 50000) {
      hrState = IDLE;
      resetHRUI();
      break;
    }

    // Calc every ~250ms if buffer is full
    if (samplesRecorded == 100 && (millis() % 250 < 20)) {
      maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer,
                                             &spo2, &validSPO2, &heartRate,
                                             &validHeartRate);

      if (validHeartRate && heartRate > 40 && heartRate < 200) {
        displayBPM = heartRate;
        last5BPM[bpmIndex] = heartRate;
        bpmIndex = (bpmIndex + 1) % 5;
      }

      if (validSPO2 && spo2 > 50 && spo2 <= 100) {
        displaySpO2 = spo2;
      }

      updateLiveStats(displayBPM, displaySpO2);
    }

    int progress = map(millis() - hrTimerStart, 0, MEASURE_DURATION, 0, 240);
    tft.fillRect(0, 125, progress, 5, TFT_GREEN);

    if (millis() - hrTimerStart > MEASURE_DURATION) {
      long sum = 0;
      int validCount = 0;
      for (int i = 0; i < 5; i++) {
        if (last5BPM[i] > 0) {
          sum += last5BPM[i];
          validCount++;
        }
      }
      if (validCount > 0)
        finalAvgBPM = sum / validCount;
      else
        finalAvgBPM = displayBPM;

      hrState = RESULT;
      showFinalResult();
    }
    break;
  }

  case RESULT:
    if (irValue < 50000) {
      hrState = IDLE;
      resetHRUI();
    }
    break;
  }
}

// ================= UI FUNCTIONS =================

void drawStaticUI() {
  tft.setTextDatum(TC_DATUM);
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawString("SMART GUARDIAN", 120, 5, 2);
  tft.drawLine(0, 25, 240, 25, TFT_DARKGREY);

  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_SILVER, TFT_BLACK);
  tft.drawString("Steps:", 5, 110, 2);
  tft.print(stepCount);
}

void updateStepUI() {
  tft.fillRect(50, 110, 60, 20, TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString(String(stepCount), 50, 110, 2);
}

void updateLiveStats(int bpm, int oxy) {
  // Update HR
  tft.fillRect(20, 40, 90, 60, TFT_BLACK); // Clear Left Side
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_GREEN, TFT_BLACK);
  tft.drawNumber(bpm, 60, 60, 6);
  tft.drawString("BPM", 60, 90, 2);

  // Update SpO2
  tft.fillRect(130, 40, 90, 60, TFT_BLACK); // Clear Right Side
  tft.setTextColor(TFT_CYAN, TFT_BLACK);
  tft.drawNumber(oxy, 180, 60, 6);
  tft.drawString("SpO2 %", 180, 90, 2);

  // Pulse Heart Animation (Toggle)
  static bool beatToggle = false;
  if (beatToggle)
    tft.drawBitmap(112, 110, heart_bmp, 16, 16, TFT_RED);
  else
    tft.fillRect(112, 110, 16, 16, TFT_BLACK);
  beatToggle = !beatToggle;
}

void showFinalResult() {
  tft.fillScreen(TFT_BLACK);
  drawStaticUI();
  tft.setTextColor(TFT_YELLOW, TFT_BLACK);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("DONE", 120, 35, 4);

  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.drawString("AVG HR:", 70, 70, 2);
  tft.drawNumber(finalAvgBPM, 70, 95, 4);

  tft.drawString("SpO2:", 170, 70, 2);
  tft.drawNumber(displaySpO2, 170, 95, 4);
}

void resetHRUI() {
  tft.fillScreen(TFT_BLACK);
  drawStaticUI();
  updateStepUI();
  displayBPM = 0;
  displaySpO2 = 0;
  for (int i = 0; i < 5; i++)
    last5BPM[i] = 0;
}

void showFallAlert() {
  tft.fillScreen(TFT_RED);
  tft.setTextColor(TFT_WHITE, TFT_RED);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("FALL DETECTED!", 120, 67, 4);
  sendDataToServer();
  delay(2000);
  fallDetected = false;
  resetHRUI();
}

// ================= WEB SERVER =================

void sendDataToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String json = "{";
    json += "\"device_id\":\"" + String(deviceId) + "\",";
    json += "\"fall_status\":" + String(fallDetected ? "true" : "false") + ",";
    json += "\"step_count\":" + String(stepCount) + ","; // UPDATED KEY

    int bpmToSend = (hrState == RESULT) ? finalAvgBPM : displayBPM;
    json += "\"heart_rate\":" + String(bpmToSend) + ",";
    json += "\"spo2\":" + String(displaySpO2) + ",";
    // Server expects number, sending 0. Add logic later if needed to parse
    // "Awake"/"Sleep" to hours
    json += "\"sleep_hours\":0,";
    json += "\"battery_level\":100,";               // ADDED
    json += "\"wifi_rssi\":" + String(WiFi.RSSI()); // ADDED
    json += "}";

    int responseCode = http.POST(json);
    if (responseCode > 0) {
      Serial.println("JSON Sent: " + json);
    } else {
      Serial.println("WiFi Send Failed");
    }
    http.end();
  }
}