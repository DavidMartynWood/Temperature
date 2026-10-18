using System;
using System.Collections.Generic;
using OpenTelemetry.Metrics;
using Polly;
using Serilog;

// Simple Serilog -> OTLP configuration. Reads `OTEL_EXPORTER_OTLP_ENDPOINT`,
// falling back to localhost:4317 which is the default Alloy/Grafana agent OTLP gRPC port.
var otlpEndpoint = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT")
                   ?? "http://localhost:4317";

// Capture Serilog sink errors to stderr for diagnosis.
Serilog.Debugging.SelfLog.Enable(msg => Console.Error.WriteLine("SERILOG_SELF: " + msg));

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("System.Net.Http.HttpClient", Serilog.Events.LogEventLevel.Warning)
    .WriteTo.Console()
    .WriteTo.OpenTelemetry(opts => { opts.Endpoint = otlpEndpoint; })
    .CreateLogger();

try
{
    var builder = Host.CreateApplicationBuilder(args);
    builder.Logging.ClearProviders();
    builder.Logging.AddSerilog(dispose: true);
    var endpoints = new List<TemperatureForwardingEndpoint>
        {
            new() { Url = "http://192.168.4.162:1880/temperature" },
            new() { Url = "https://lake-temperature.davidmartynwood.workers.dev/api/readings", BearerToken = builder.Configuration["LAKE_TEMPERATURE_API_TOKEN"] }
        };

    foreach (var endpoint in endpoints)
    {
        if (!Uri.TryCreate(endpoint.Url, UriKind.Absolute, out var endpointUri) ||
            (endpointUri.Scheme != Uri.UriSchemeHttp && endpointUri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException(
                "TemperatureForwarding endpoints must have an absolute HTTP or HTTPS URL.");
        }
    }

    builder.Services.AddOpenTelemetry()
        .WithMetrics(metrics => metrics
            .AddMeter(SerialLineWorker.MeterName)
            .AddMeter(TemperatureForwardingMetrics.MeterName)
            .AddOtlpExporter(options => options.Endpoint = new Uri(otlpEndpoint)));

    builder.Services.AddSingleton<TemperatureForwardingMetrics>();
    builder.Services.AddSingleton<IReadOnlyList<TemperatureForwardingEndpoint>>(endpoints);

    // Retry for transient network errors, with exponential backoff 8 times totalling about 4 minutes
    builder.Services.AddHttpClient<TemperatureSensorForwarder>()
        .AddPolicyHandler((services, _) =>
        {
            var metrics = services.GetRequiredService<TemperatureForwardingMetrics>();
            return Policy<HttpResponseMessage>
                .Handle<HttpRequestException>()
                .WaitAndRetryAsync(
                    8,
                    retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt - 1)),
                    onRetry: (_, _, _, _) => metrics.RecordRetry());
        });

    builder.Services.AddHostedService<SerialLineWorker>();

    var host = builder.Build();
    await host.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
