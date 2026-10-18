using System.Globalization;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging;

public sealed class TemperatureSensorForwarder
{
    private static readonly Uri Endpoint = new("http://192.168.4.162:1880/temperature");

    private readonly HttpClient _httpClient;
    private readonly ILogger<TemperatureSensorForwarder> _logger;
    private readonly TemperatureForwardingMetrics _metrics;

    public TemperatureSensorForwarder(
        HttpClient httpClient,
        ILogger<TemperatureSensorForwarder> logger,
        TemperatureForwardingMetrics metrics)
    {
        _httpClient = httpClient;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task ForwardAsync(
        double temperature_c,
        DateTimeOffset timestamp,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _httpClient.PostAsJsonAsync(
                Endpoint,
                new
                {
                    temperature_c,
                    timestamp = timestamp.UtcDateTime.ToString(
                        "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
                        CultureInfo.InvariantCulture)
                },
                cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to forward temperature sensor data");
            _metrics.RecordFailure();
        }
    }
}
