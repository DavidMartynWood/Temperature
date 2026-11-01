# Lake temperature

This repository collects and displays lake-water temperature readings. The data path is:

1. `LakeNode/` reads a DS18B20 temperature sensor and battery voltage, then sends a LoRa packet.
2. `HomeNode/` receives the packet, decodes it, and writes a JSON line over USB serial.
3. `temperature/` reads the serial stream and forwards readings to a local HTTP endpoint and the Cloudflare API.
4. `lake-temperature/` validates and stores readings in Cloudflare D1 and serves the website and history API.

## LakeNode and HomeNode

The two firmware projects are a matched pair of RAK4631 WisBlock Core modules (nRF52840 + SX1262) that talk over LoRa point-to-point (no LoRaWAN gateway or network server).

| | `LakeNode/` (transmitter) | `HomeNode/` (receiver) |
| --- | --- | --- |
| Location | At the lake, battery powered | Near the Raspberry Pi (or similar), powered over USB |
| Role | Reads the DS18B20 and battery level, transmits one packet, sleeps | Listens continuously, decodes packets, prints JSON lines on USB serial |
| Cadence | Immediately at boot, then every 30 minutes (`SLEEP_TIME`) | Always receiving |

The machine that runs the `temperature/` forwarder (for example a Raspberry Pi) is connected by USB to the **HomeNode** WisBlock. The board appears as a serial device (`/dev/ttyACM0` by default, override with `TEMPERATURE_SERIAL_PORT`) at 115200 baud, and the forwarder reads one JSON line per packet.

### Radio settings (must match on both nodes)

868.3 MHz, 125 kHz bandwidth, SF12, coding rate 4/8, preamble 8, explicit header, CRC on, no IQ inversion. TX power is 14 dBm.

### Packet format

Seven bytes, with 16-bit fields in big-endian order:

| Byte | Field |
| --- | --- |
| 0 | Protocol version (`1`) |
| 1 | Device ID |
| 2-3 | Packet counter |
| 4-5 | Temperature in tenths of °C, signed. `0x8000` means the sensor is disconnected |
| 6 | Battery percentage |

HomeNode rejects packets with the wrong size or protocol version, emitting `{"error":...}`. Valid packets become:

```json
{"rssi":-97,"snr":6,"payload":{"count":12,"b":87,"t":14.3}}
```

`t` is `null` when the sensor is disconnected.

### Wiring the DS18B20 temperature sensor to the WisBlock

LakeNode reads a DS18B20 (waterproof probe versions have three wires) over 1-Wire on `WB_IO1` (nRF52840 P0.17) of the WisBlock base board.

| DS18B20 wire (typical colours) | WisBlock base board |
| --- | --- |
| Black / blue: GND | `GND` |
| Red: VDD | `3V3` |
| Yellow / white: DATA | `IO1` (`WB_IO1`) |

Add a **4.7 kΩ pull-up resistor between DATA and 3V3**. Without it the sensor is not found and the reading is reported as disconnected. Check the pin labels on your base board's silkscreen and sensor datasheet before powering up, as wire colours vary between suppliers.

```text
 3V3 ──┬───────────── VDD (red)
       │
     [4.7k]
       │
 IO1 ──┴───────────── DATA (yellow)
 GND ───────────────── GND (black)
```

The sketch needs the `OneWire` and `DallasTemperature` Arduino libraries and reads the first sensor on the bus. Battery voltage is read from `WB_A0` using the board's built-in divider, so no extra wiring is needed.

Set `MYLOG_LOG_LEVEL` to `1` in `LakeNode.ino` to enable serial debug output (it prints the number of DS18B20 sensors found).

### Design decisions

These come from the project's pull requests:

- **Fixed binary payload instead of text** (version byte, device ID, counter, temperature, battery): the packet is tiny, which matters at SF12, and the version byte lets the format change safely. Temperature is a signed integer in tenths of a degree, with `INT16_MIN` as a "sensor disconnected" sentinel so a fault is not mistaken for 0 °C.
- **Receiver does the decoding and emits JSON lines**: the .NET forwarder stays free of radio details. Decimal formatting is done manually to avoid depending on floating-point `printf`.
- **Long range over speed**: SF12 and coding rate 4/8 trade airtime for distance. TX power was lowered from 22 to 14 dBm to stay within legal limits on 868 MHz.
- **Low-power transmitter**: a software timer wakes the loop every 30 minutes and the radio is put to sleep after each send. The first ADC battery reading is discarded because it is unreliable.
- **Observable reliability**: the forwarder counts `OnRxError` lines in a `radio_rx_errors` metric (#2), and applies a Polly retry per endpoint with failures isolated between the local and Cloudflare destinations (#10).
- **Configuration through environment variables** (#16): serial port and endpoints keep their defaults but can be overridden.
- **Website and Worker**:
  - API input is validated, the Worker is split into router, handlers, validation and config modules, and tests and type-checking run in CI (#9, #16).
  - Date ranges and daily low/high use UTC boundaries, after a local-midnight experiment was reverted (#11, #12, #15).
  - The chart uses Chart.js with decimation, no point markers, and a 1° axis buffer (#9, #17, #18, #26).
  - Stale data (older than 12 hours) is flagged with a text banner, not colour alone (#25, #26).
  - History starts from 18 October 2026, the first reading (#6).
  - PRs deploy a read-only preview Worker, a QA Worker holds a year of synthetic data, and bulk deletes go through an approval-gated workflow (#13, #27, #28, #31).

## Repository layout

| Path | Purpose |
| --- | --- |
| `LakeNode/` | LoRa temperature-sensor transmitter firmware |
| `HomeNode/` | LoRa receiver firmware and serial JSON output |
| `temperature/` | .NET serial reader, telemetry, retries, and HTTP forwarding |
| `temperature.Tests/` | .NET integration and message-parsing tests |
| `lake-temperature/` | Cloudflare Worker, D1 migrations, and static website |
| `.github/workflows/` | .NET tests, PR preview deployment, and production deployment |

## Development and validation

### Firmware

Open the relevant `.ino` file with the Arduino toolchain for the RAK4631 board. Install the libraries included at the top of each sketch and configure the LoRa frequency and hardware to match both nodes.

### Serial forwarder

Requires the .NET 10 SDK. Configure the optional environment variables below, then run from the repository root:

```sh
dotnet run --project temperature
dotnet test Temperature.slnx --configuration Release
```

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `TEMPERATURE_SERIAL_PORT` | `/dev/ttyACM0` | Receiver USB serial device |
| `TEMPERATURE_LOCAL_ENDPOINT_URL` | `http://192.168.4.162:1880/temperature` | Local reading destination |
| `LAKE_TEMPERATURE_ENDPOINT_URL` | `https://lake-temperature.davidmartynwood.workers.dev/api/readings` | Cloudflare ingestion URL |
| `LAKE_TEMPERATURE_API_TOKEN` | unset | API credential for Cloudflare ingestion |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OpenTelemetry export endpoint |

Environment variables can be set in the shell or through the standard .NET configuration providers. Keep credentials such as the ingestion token out of source control.

### Cloudflare app

See [`lake-temperature/README.md`](lake-temperature/README.md) for local Worker setup, API details, tests, and deployment information. The app's test and type-check commands are run in the PR workflow.

## Deployment

Pull requests can deploy a read-only preview Worker. Merges to `main` apply production D1 migrations and deploy the Worker and website; these workflows require the Cloudflare credentials configured as repository secrets.
