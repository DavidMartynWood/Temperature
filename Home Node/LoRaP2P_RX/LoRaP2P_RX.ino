
/**
 * @file LoRaP2P_RX.ino
 * @brief Receiver node for LoRa point-to-point communication
 */

#include <Arduino.h>
#include <SX126x-RAK4630.h>
#include <SPI.h>

// Function declarations
void OnRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr);
void OnRxTimeout(void);
void OnRxError(void);

#ifdef NRF52_SERIES
#define LED_BUILTIN 35
#endif

// LoRa parameters
#define RF_FREQUENCY 868300000	// Hz
#define TX_OUTPUT_POWER 14		// dBm - was 22 which may be illegal
#define LORA_BANDWIDTH 0		// [0: 125 kHz, 1: 250 kHz, 2: 500 kHz, 3: Reserved]
#define LORA_SPREADING_FACTOR 12 // [SF7..SF12] - was 7 which is good for speed but bad for distance
#define LORA_CODINGRATE 4		// [1: 4/5, 2: 4/6,  3: 4/7,  4: 4/8] - was 1 which is good for speed but bad for distance
#define LORA_PREAMBLE_LENGTH 12	// Same for Tx and Rx - was 8 but, increasing helps a bit in weak signal environments (not huge impact)
#define LORA_SYMBOL_TIMEOUT 0	// Symbols
#define LORA_FIX_LENGTH_PAYLOAD_ON false
#define LORA_IQ_INVERSION_ON false

// Payload format
#define PROTOCOL_VERSION 1
#define PAYLOAD_SIZE 7

static RadioEvents_t RadioEvents;

void setup()
{
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
    Serial.println("LoRaP2P Rx Test");
    Serial.println("=====================================");
    // Initialize LoRa chip.
    lora_rak4630_init();
    // Initialize the Radio callbacks
    RadioEvents.TxDone = NULL;
    RadioEvents.RxDone = OnRxDone;
    RadioEvents.TxTimeout = NULL;
    RadioEvents.RxTimeout = OnRxTimeout;
    RadioEvents.RxError = OnRxError;
    RadioEvents.CadDone = NULL;

    // Initialize the Radio
    Radio.Init(&RadioEvents);

    // Set Radio channel
    Radio.SetChannel(RF_FREQUENCY);

    // Set Radio RX configuration
    Radio.SetRxConfig(
        MODEM_LORA,
        LORA_BANDWIDTH,
        LORA_SPREADING_FACTOR,
        LORA_CODINGRATE,
        0,
        LORA_PREAMBLE_LENGTH,
        LORA_SYMBOL_TIMEOUT,
        LORA_FIX_LENGTH_PAYLOAD_ON,
        0,
        true,
        0,
        0,
        LORA_IQ_INVERSION_ON,
        true
    );

    // Start LoRa
    Serial.println("Starting Radio.Rx");
    Radio.Rx(0);
}

void loop()
{
    // Radio reception is handled by callbacks.
}

/** @brief Process a received packet */
void OnRxDone(uint8_t *payload, uint16_t size, int16_t rssi, int8_t snr)
{
    if (size != PAYLOAD_SIZE)
    {
        Serial.printf(
            "{\"error\":\"Invalid payload size\",\"size\":%u}\n",
            size
        );
        Radio.Rx(0);
        return;
    }

    // Decode protocol header
    uint8_t version = payload[0];
    uint8_t deviceId = payload[1];

    if (version != PROTOCOL_VERSION)
    {
        Serial.printf(
            "{\"error\":\"Unsupported protocol version\",\"version\":%u}\n",
            version
        );
        Radio.Rx(0);
        return;
    }

    // Decode 16-bit big-endian fields
    uint16_t count =
        ((uint16_t)payload[2] << 8) |
        (uint16_t)payload[3];

    uint16_t temperatureRaw =
        ((uint16_t)payload[4] << 8) |
        (uint16_t)payload[5];

    int16_t temperatureDeci = (int16_t)temperatureRaw;
    uint8_t batteryPercent = payload[6];

    // Output outer JSON and original-style payload JSON.
    Serial.printf(
        "{\"rssi\":%d,\"snr\":%d,\"payload\":{"
        "\"count\":%u,\"b\":%u,",
        rssi,
        snr,
        count,
        batteryPercent
    );

    // Temperature sentinel means sensor disconnected.
    if (temperatureDeci == INT16_MIN)
    {
        Serial.print("\"t\":null");
    }
    else
    {
        // Format to one decimal place without relying on
        // floating-point printf support.
        int32_t magnitude = temperatureDeci;
        if (magnitude < 0)
        {
            Serial.print("\"t\":-");
            magnitude = -magnitude;
        }
        else
        {
            Serial.print("\"t\":");
        }

        Serial.printf(
            "%ld.%ld",
            (long)(magnitude / 10),
            (long)(magnitude % 10)
        );
    }

    Serial.println("}}");

    // Continue listening for the next packet.
    Radio.Rx(0);
}

/** @brief Radio receive timeout */
void OnRxTimeout(void)
{
    Serial.println("OnRxTimeout");
    Radio.Rx(0);
}

/** @brief Radio receive error */
void OnRxError(void)
{
    Serial.println("OnRxError");
    Radio.Rx(0);
}