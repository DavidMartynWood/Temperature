using System.Net.Http;
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
        string json,
        DateTimeOffset receivedAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            var payload = JsonNode.Parse(json)?.AsObject()
                ?? throw new JsonException("Temperature sensor JSON must be an object");
            payload["receivedAtUtc"] = receivedAtUtc;

            using var content = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
            using var response = await _httpClient.PostAsync(Endpoint, content, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to forward temperature sensor data");
            _metrics.RecordFailure();
        }
    }
}
