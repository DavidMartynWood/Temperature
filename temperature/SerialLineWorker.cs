using System.IO;
using System.IO.Ports;
using System.Diagnostics.Metrics;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

public sealed class SerialLineWorker : BackgroundService
{
    public const string MeterName = "Temperature.Radio";

    private readonly ILogger<SerialLineWorker> _logger;
    private readonly Meter _meter = new(MeterName);
    private readonly Gauge<double> _temperatureGauge;
    private readonly Gauge<int> _batteryGauge;

    public SerialLineWorker(ILogger<SerialLineWorker> logger)
    {
        _logger = logger;
        _temperatureGauge = _meter.CreateGauge<double>("temperature", unit: "°C");
        _batteryGauge = _meter.CreateGauge<int>("battery", unit: "%");
    }

    private void UpdateMeasurements(RadioPayload payload)
    {
        if (payload.Temperature is double temperature)
        {
            _temperatureGauge.Record(temperature);
        }

        _batteryGauge.Record(payload.BatteryPercent);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        const string portName = "/dev/ttyACM0";
        const int baudRate = 9600;

        using var serial = new SerialPort(portName, baudRate)
        {
            DataBits = 8,
            Parity = Parity.None,
            StopBits = StopBits.One,
            Handshake = Handshake.None,
            ReadTimeout = 1000,
            WriteTimeout = 1000,
            DtrEnable = true,
            RtsEnable = true,
            NewLine = "\n"
        };

        try
        {
            serial.Open();
            _logger.LogInformation("Listening on {PortName} at {BaudRate} baud", portName, baudRate);

            using var reader = new StreamReader(serial.BaseStream);

            while (!stoppingToken.IsCancellationRequested)
            {
                string? line = await reader.ReadLineAsync(stoppingToken);
                if (line is null)
                {
                    break;
                }

                if (!string.IsNullOrWhiteSpace(line))
                {
                    _logger.LogInformation("Received line: {Line}", line);

                    try
                    {
                        var message = JsonSerializer.Deserialize<RadioMessage>(line);
                        if (message?.Payload is null)
                        {
                            _logger.LogWarning("Ignoring JSON line without a radio payload");
                            continue;
                        }

                        UpdateMeasurements(message.Payload);
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogDebug(ex, "Ignoring line that is not a valid radio message");
                    }
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Shutdown requested");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Serial read error");
        }
        finally
        {
            if (serial.IsOpen)
            {
                serial.Close();
            }
        }
    }

    public override void Dispose()
    {
        _meter.Dispose();
        base.Dispose();
    }
}
