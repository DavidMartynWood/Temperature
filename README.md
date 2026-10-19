# Lake temperature

This repository collects and displays lake-water temperature readings. The data path is:

1. `LakeNode/` reads a DS18B20 temperature sensor and battery voltage, then sends a LoRa packet.
2. `HomeNode/` receives the packet, decodes it, and writes a JSON line over USB serial.
3. `temperature/` reads the serial stream and forwards readings to a local HTTP endpoint and the Cloudflare API.
4. `lake-temperature/` validates and stores readings in Cloudflare D1 and serves the website and history API.

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
| `LAKE_TEMPERATURE_API_TOKEN` | unset | ****** for Cloudflare ingestion |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OpenTelemetry export endpoint |

Environment variables can be set in the shell or through the standard .NET configuration providers. Keep credentials such as the ingestion token out of source control.

### Cloudflare app

See [`lake-temperature/README.md`](lake-temperature/README.md) for local Worker setup, API details, tests, and deployment information. The app's test and type-check commands are run in the PR workflow.

## Deployment

Pull requests can deploy a read-only preview Worker. Merges to `main` apply production D1 migrations and deploy the Worker and website; these workflows require the Cloudflare credentials configured as repository secrets.
