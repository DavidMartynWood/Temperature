using System;
using OpenTelemetry.Metrics;
using Serilog;

// Simple Serilog -> OTLP configuration. Reads `OTEL_EXPORTER_OTLP_ENDPOINT`,
// falling back to localhost:4317 which is the default Alloy/Grafana agent OTLP gRPC port.
var otlpEndpoint = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT")
                   ?? "http://localhost:4317";

// Capture Serilog sink errors to stderr for diagnosis.
Serilog.Debugging.SelfLog.Enable(msg => Console.Error.WriteLine("SERILOG_SELF: " + msg));

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .WriteTo.OpenTelemetry(opts => { opts.Endpoint = otlpEndpoint; })
    .CreateLogger();

try
{
    var builder = Host.CreateApplicationBuilder(args);
    builder.Logging.ClearProviders();
    builder.Logging.AddSerilog(dispose: true);

    builder.Services.AddOpenTelemetry()
        .WithMetrics(metrics => metrics
            .AddMeter(SerialLineWorker.MeterName)
            .AddOtlpExporter(options => options.Endpoint = new Uri(otlpEndpoint)));

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
