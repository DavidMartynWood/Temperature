/**
 * @file LoRaP2P_TX.ino
 * @author rakwireless.com
 * @brief Transmitter node for LoRa point to point communication
 * @version 0.1
 * @date 2020-08-21
 * 
 * @copyright Copyright (c) 2020
 * 
 * @note RAK4631 GPIO mapping to nRF52840 GPIO ports
   RAK4631    <->  nRF52840
   WB_IO1     <->  P0.17 (GPIO 17)
   WB_IO2     <->  P1.02 (GPIO 34)
   WB_IO3     <->  P0.21 (GPIO 21)
   WB_IO4     <->  P0.04 (GPIO 4)
   WB_IO5     <->  P0.09 (GPIO 9)
   WB_IO6     <->  P0.10 (GPIO 10)
   WB_SW1     <->  P0.01 (GPIO 1)
   WB_A0      <->  P0.04/AIN2 (AnalogIn A2)
   WB_A1      <->  P0.31/AIN7 (AnalogIn A7)
 */

#include <Arduino.h>
#include <SX126x-RAK4630.h> //http://librarymanager/All#SX126x
#include <SPI.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Function declarations
void OnTxDone(void);
void OnTxTimeout(void);

#ifdef NRF52_SERIES
#define LED_BUILTIN 35
#endif

// Define LoRa parameters
#define RF_FREQUENCY 868300000	// Hz
#define TX_OUTPUT_POWER 14		// dBm - was 22 which may be illegal
#define LORA_BANDWIDTH 0		// [0: 125 kHz, 1: 250 kHz, 2: 500 kHz, 3: Reserved]
#define LORA_SPREADING_FACTOR 12 // [SF7..SF12] - was 7 which is good for speed but bad for distance
#define LORA_CODINGRATE 4		// [1: 4/5, 2: 4/6,  3: 4/7,  4: 4/8] - was 1 which is good for speed but bad for distance
#define LORA_PREAMBLE_LENGTH 12	// Same for Tx and Rx - was 8 but, increasing helps a bit in weak signal environments (not huge impact)
#define LORA_SYMBOL_TIMEOUT 0	// Symbols
#define LORA_FIX_LENGTH_PAYLOAD_ON false
#define LORA_IQ_INVERSION_ON false
#define RX_TIMEOUT_VALUE 3000
#define TX_TIMEOUT_VALUE 3000

#define MYLOG_LOG_LEVEL 0

// Sleep time in milliseconds (30 minutes = 1800000)
#define SLEEP_TIME 1800000

static RadioEvents_t RadioEvents;
static uint8_t TxdBuffer[64];
int count = 0;

// Semaphore to wake up loop task
SemaphoreHandle_t taskEvent = NULL;
// Timer to wake up loop
SoftwareTimer taskWakeupTimer;

// -----------------------------------------------------------------------------
// Temperature sensor
// -----------------------------------------------------------------------------

#define ONE_WIRE_BUS WB_IO1

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature temperatureSensor(&oneWire);

// -----------------------------------------------------------------------------
// Battery
// -----------------------------------------------------------------------------

#define PIN_VBAT WB_A0

uint32_t vbat_pin = PIN_VBAT;

#define VBAT_MV_PER_LSB (0.73242188F) // 3.0V ADC range and 12 - bit ADC resolution = 3000mV / 4096
#define VBAT_DIVIDER_COMP (1.73)      // Compensation factor for the VBAT divider, depend on the board

#define REAL_VBAT_MV_PER_LSB (VBAT_DIVIDER_COMP * VBAT_MV_PER_LSB)

void periodicWakeup(TimerHandle_t unused)
{
  // Give the semaphore, so the loop task will wake up
  xSemaphoreGiveFromISR(taskEvent, pdFALSE);
}

void setup()
{
#if MYLOG_LOG_LEVEL > 0
	// Initialize Serial for debug output
	time_t timeout = millis();
	Serial.begin(115200);
	while (!Serial)
	{
		if ((millis() - timeout) < 5000)
		{
            delay(100);
        }
        else
        {
            break;
        }
	}
	Serial.println("=====================================");
	Serial.println("LoRap2p Tx Test");
	Serial.println("=====================================");
#endif

    // -------------------------------------------------------------------------
    // Initialize temperature sensor
    // -------------------------------------------------------------------------

    temperatureSensor.begin();

#if MYLOG_LOG_LEVEL > 0
    Serial.print("DS18B20 sensors found: ");
    Serial.println(temperatureSensor.getDeviceCount());
#endif

    // -------------------------------------------------------------------------
    // Initialize LoRa chip
    // -------------------------------------------------------------------------

	lora_rak4630_init();
	// Initialize the Radio callbacks
	RadioEvents.TxDone = OnTxDone;
	RadioEvents.RxDone = NULL;
	RadioEvents.TxTimeout = OnTxTimeout;
	RadioEvents.RxTimeout = NULL;
	RadioEvents.RxError = NULL;
	RadioEvents.CadDone = NULL;

	// Initialize the Radio
	Radio.Init(&RadioEvents);

	// Set Radio channel
	Radio.SetChannel(RF_FREQUENCY);

	// Set Radio TX configuration
	Radio.SetTxConfig(MODEM_LORA, TX_OUTPUT_POWER, 0, LORA_BANDWIDTH,
					  LORA_SPREADING_FACTOR, LORA_CODINGRATE,
					  LORA_PREAMBLE_LENGTH, LORA_FIX_LENGTH_PAYLOAD_ON,
					  true, 0, 0, LORA_IQ_INVERSION_ON, TX_TIMEOUT_VALUE);

  // -------------------------------------------------------------------------
  // Configure battery measurement
  // -------------------------------------------------------------------------

	// Set the analog reference to 3.0V (default = 3.6V)
	analogReference(AR_INTERNAL_3_0);
	// Set the resolution to 12-bit (0..4095)
	analogReadResolution(12); // Can be 8, 10, 12 or 14

	// Let the ADC settle
  delay(5);

	// Take a single battery reading and throw it away. Fist read always seems to be wrong.
	readVBAT();

	// -------------------------------------------------------------------------
	// Sleep/wakeup mechanism
	// -------------------------------------------------------------------------

	taskEvent = xSemaphoreCreateBinary();

	// Give the semaphore, seems to be required to initialize it
	xSemaphoreGive(taskEvent);

	// Take the semaphore, so loop will be stopped waiting to get it
	xSemaphoreTake(taskEvent, 10);

	// Start the timer that will wakeup the loop frequently
	taskWakeupTimer.begin(SLEEP_TIME, periodicWakeup);
	taskWakeupTimer.start();

	// Send the first reading immediately
	send();
}

void loop()
{
    // Sleep until we are woken up by an event
  if (xSemaphoreTake(taskEvent, portMAX_DELAY) == pdTRUE)
  {
		send();
	}
}

/**@brief Function to be executed on Radio Tx Done event
 */
void OnTxDone(void)
{
#if MYLOG_LOG_LEVEL > 0
	Serial.println("OnTxDone");
#endif

	Radio.Sleep();
}

/**@brief Function to be executed on Radio Tx Timeout event
 */
void OnTxTimeout(void)
{
#if MYLOG_LOG_LEVEL > 0
	Serial.println("OnTxTimeout");
#endif

	Radio.Sleep();
}

/**
 * @brief Get RAW Battery Voltage
 */
float readVBAT(void)
{
    float raw;

    // Get the raw 12-bit, 0..3000mV ADC value
    raw = analogRead(vbat_pin);

    return raw * REAL_VBAT_MV_PER_LSB;
}

/**
 * @brief Convert from raw mv to percentage
 * @param mvolts
 *    RAW Battery Voltage
 */
uint8_t mvToPercent(float mvolts)
{
    if (mvolts < 3300)
        return 0;

    if (mvolts < 3600)
    {
        mvolts -= 3300;
        return mvolts / 30;
    }

    mvolts -= 3600;
    return 10 + (mvolts * 0.15F); // thats mvolts /6.66666666
}

void send()
{
	// Switch on green LED to show we are awake
#if MYLOG_LOG_LEVEL > 0
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500); // Only so we can see the green LED
#endif

	count++;

	// -------------------------------------------------------------------------
	// Read temperature
	// -------------------------------------------------------------------------

	temperatureSensor.requestTemperatures();

	float temperatureC = temperatureSensor.getTempCByIndex(0);

	// -------------------------------------------------------------------------
	// Read battery
	// -------------------------------------------------------------------------

	float vbat_mv = readVBAT();

	uint8_t vbat_per = mvToPercent(vbat_mv);

    // -------------------------------------------------------------------------
    // Build packet
    // -------------------------------------------------------------------------

    int len;

    if (temperatureC == DEVICE_DISCONNECTED_C)
    {
        // Sensor wasn't detected
        len = snprintf(
            (char *)TxdBuffer,
            sizeof(TxdBuffer),
            "{\"count\":%d, \"b\":%d, \"bv\":%d, \"t\":null}",
            count,
            vbat_per,
            (int)vbat_mv);
    }
    else
    {
        len = snprintf(
            (char *)TxdBuffer,
            sizeof(TxdBuffer),
            "{\"count\":%d, \"b\":%d, \"bv\":%d, \"t\":%.2f}",
            count,
            vbat_per,
            (int)vbat_mv,
            temperatureC);
    }
	//int len = snprintf((char *)TxdBuffer, sizeof(TxdBuffer),
  //                 "{\"count\":%d, \"b\":%d, \"bv\":%d}", count, vbat_per, (int)vbat_mv);

#if MYLOG_LOG_LEVEL > 0

  Serial.print("Temperature: ");

  if (temperatureC == DEVICE_DISCONNECTED_C)
  {
      Serial.println("DISCONNECTED");
  }
  else
  {
      Serial.print(temperatureC);
      Serial.println(" C");
  }

	Serial.write(TxdBuffer, len);
	Serial.println();
#endif

	Radio.Send(TxdBuffer, len);

#if MYLOG_LOG_LEVEL > 0
    digitalWrite(LED_BUILTIN, LOW);
#endif
}
