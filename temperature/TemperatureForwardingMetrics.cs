using System.Diagnostics.Metrics;

public sealed class TemperatureForwardingMetrics
{
    public const string MeterName = "Temperature.SensorForwarder";

    private readonly Counter<long> _retryCounter;
    private readonly Counter<long> _failureCounter;

    public TemperatureForwardingMetrics(IMeterFactory meterFactory)
    {
        var meter = meterFactory.Create(MeterName);
        _retryCounter = meter.CreateCounter<long>("temperature_forward_retries");
        _failureCounter = meter.CreateCounter<long>("temperature_forward_failures");
    }

    public void RecordRetry() => _retryCounter.Add(1);

    public void RecordFailure() => _failureCounter.Add(1);
}
