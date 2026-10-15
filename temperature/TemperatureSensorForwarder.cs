using System.Diagnostics.Metrics;
using System.Net.Http;
using System.Text;
using Microsoft.Extensions.Logging;

public sealed class TemperatureSensorForwarder
{
    public const string MeterName = "Temperature.SensorForwarder";

    private static readonly Uri Endpoint = new("http://192.168.4.62/temperature");

    private readonly HttpClient _httpClient;
    private readonly ILogger<TemperatureSensorForwarder> _logger;
    private readonly Counter<long> _failureCounter;

    public TemperatureSensorForwarder(
        HttpClient httpClient,
        ILogger<TemperatureSensorForwarder> logger,
        IMeterFactory meterFactory)
    {
        _httpClient = httpClient;
        _logger = logger;
        _failureCounter = meterFactory.Create(MeterName)
            .CreateCounter<long>("temperature_forward_failures");
    }

    public async Task ForwardAsync(string json, CancellationToken cancellationToken)
    {
        try
        {
            using var content = new StringContent(json, Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync(Endpoint, content, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to forward temperature sensor data");
            _failureCounter.Add(1);
        }
    }
}
