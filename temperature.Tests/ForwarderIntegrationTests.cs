using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Logging;
using Polly;
using Xunit;

public sealed class ForwarderIntegrationTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, string Body)> Calls { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            lock (Calls) Calls.Add((request, body));
            return respond(request, body);
        }
    }

    // Builds the real DI graph (typed HttpClient + Polly retry + metrics) with an in-memory HTTP handler.
    private static ServiceProvider Build(
        FakeHandler handler,
        params TemperatureForwardingEndpoint[] endpoints)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddMetrics();
        services.AddSingleton<TemperatureForwardingMetrics>();
        services.AddSingleton<IReadOnlyList<TemperatureForwardingEndpoint>>(endpoints);
        services.AddHttpClient<TemperatureSensorForwarder>()
            .AddPolicyHandler((sp, _) => Policy<HttpResponseMessage>
                .Handle<HttpRequestException>()
                .RetryAsync(2, onRetry: (_, _) => sp.GetRequiredService<TemperatureForwardingMetrics>().RecordRetry()))
            .ConfigurePrimaryHttpMessageHandler(() => handler);
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task Forwards_reading_to_every_endpoint_with_bearer_token_where_configured()
    {
        var handler = new FakeHandler((_, _) => new HttpResponseMessage(HttpStatusCode.OK));
        using var sp = Build(handler,
            new() { Url = "http://local.test/temperature" },
            new() { Url = "https://cloud.test/api/readings", BearerToken = "secret" });

        var ts = new DateTimeOffset(2026, 1, 2, 3, 4, 5, 678, TimeSpan.Zero);
        await sp.GetRequiredService<TemperatureSensorForwarder>().ForwardAsync(12.5, ts, CancellationToken.None);

        Assert.Equal(2, handler.Calls.Count);
        var local = handler.Calls.Single(c => c.Request.RequestUri!.Host == "local.test");
        var cloud = handler.Calls.Single(c => c.Request.RequestUri!.Host == "cloud.test");
        Assert.Null(local.Request.Headers.Authorization);
        Assert.Equal("Bearer", cloud.Request.Headers.Authorization!.Scheme);
        Assert.Equal("secret", cloud.Request.Headers.Authorization.Parameter);

        using var doc = JsonDocument.Parse(cloud.Body);
        Assert.Equal(12.5, doc.RootElement.GetProperty("temperature_c").GetDouble());
        Assert.Equal("2026-01-02T03:04:05.678Z", doc.RootElement.GetProperty("timestamp").GetString());
    }

    [Fact]
    public async Task Failing_endpoint_does_not_throw_or_block_other_endpoints()
    {
        var handler = new FakeHandler((req, _) => new HttpResponseMessage(
            req.RequestUri!.Host == "bad.test" ? HttpStatusCode.InternalServerError : HttpStatusCode.OK));
        using var sp = Build(handler,
            new() { Url = "http://bad.test/x" },
            new() { Url = "http://good.test/x" });

        await sp.GetRequiredService<TemperatureSensorForwarder>()
            .ForwardAsync(1, DateTimeOffset.UtcNow, CancellationToken.None);

        Assert.Contains(handler.Calls, c => c.Request.RequestUri!.Host == "good.test");
    }

    [Fact]
    public async Task Transient_network_errors_are_retried()
    {
        var attempts = 0;
        var handler = new FakeHandler((_, _) =>
            ++attempts < 3 ? throw new HttpRequestException("boom") : new HttpResponseMessage(HttpStatusCode.OK));
        using var sp = Build(handler, new TemperatureForwardingEndpoint { Url = "http://flaky.test/x" });

        await sp.GetRequiredService<TemperatureSensorForwarder>()
            .ForwardAsync(1, DateTimeOffset.UtcNow, CancellationToken.None);

        Assert.Equal(3, handler.Calls.Count);
    }
}

public sealed class RadioMessageTests
{
    [Fact]
    public void Parses_valid_line()
    {
        var m = JsonSerializer.Deserialize<RadioMessage>(
            """{"rssi":-90,"snr":7,"payload":{"count":3,"b":88,"t":18.25}}""")!;
        Assert.Equal(-90, m.Rssi);
        Assert.Equal(7, m.Snr);
        Assert.Equal(3, m.Payload.Count);
        Assert.Equal(88, m.Payload.BatteryPercent);
        Assert.Equal(18.25, m.Payload.Temperature);
    }

    [Fact]
    public void Missing_required_field_is_rejected()
    {
        Assert.Throws<JsonException>(() =>
            JsonSerializer.Deserialize<RadioMessage>("""{"rssi":-90,"payload":{"count":3,"b":88,"t":1}}"""));
    }
}
