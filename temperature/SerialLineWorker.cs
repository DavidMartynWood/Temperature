using System.IO;
using System.IO.Ports;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

public sealed class SerialLineWorker : BackgroundService
{
    private readonly ILogger<SerialLineWorker> _logger;

    public SerialLineWorker(ILogger<SerialLineWorker> logger)
    {
        _logger = logger;
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
}
