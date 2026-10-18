using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

public sealed class TemperatureForwardingEndpoint
{
    public string Url { get; set; } = string.Empty;
    public string? BearerToken { get; set; }
}

public sealed class TemperatureSensorForwarder
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<TemperatureSensorForwarder> _logger;
    private readonly TemperatureForwardingMetrics _metrics;
    private readonly IReadOnlyList<TemperatureForwardingEndpoint> _endpoints;

    public TemperatureSensorForwarder(
        HttpClient httpClient,
        ILogger<TemperatureSensorForwarder> logger,
        TemperatureForwardingMetrics metrics,
        IReadOnlyList<TemperatureForwardingEndpoint> endpoints)
    {
        _httpClient = httpClient;
        _logger = logger;
        _metrics = metrics;
        _endpoints = endpoints;
    }

    public async Task ForwardAsync(
        double temperature_c,
        DateTimeOffset timestamp,
        CancellationToken cancellationToken)
    {
        var payload = new
        {
            temperature_c,
            timestamp = timestamp.UtcDateTime.ToString(
                "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
                CultureInfo.InvariantCulture)
        };

        var requests = _endpoints
            .Select((endpoint, endpointIndex) =>
                ForwardToEndpointAsync(endpoint, endpointIndex, payload, cancellationToken));
        await Task.WhenAll(requests);
    }

    private async Task ForwardToEndpointAsync(
        TemperatureForwardingEndpoint endpoint,
        int endpointIndex,
        object payload,
        CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint.Url)
            {
                Content = JsonContent.Create(payload)
            };
            if (!string.IsNullOrWhiteSpace(endpoint.BearerToken))
            {
                request.Headers.Authorization =
                    new AuthenticationHeaderValue("Bearer", endpoint.BearerToken);
            }

            using var response = await _httpClient.SendAsync(request, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to forward temperature sensor data to endpoint {EndpointIndex}",
                endpointIndex);
            _metrics.RecordFailure();
        }
    }
}
