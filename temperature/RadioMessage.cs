using System.Text.Json.Serialization;

public sealed class RadioMessage
{
    [JsonRequired]
    [JsonPropertyName("rssi")]
    public int Rssi { get; init; }

    [JsonRequired]
    [JsonPropertyName("snr")]
    public int Snr { get; init; }

    [JsonRequired]
    [JsonPropertyName("payload")]
    public RadioPayload Payload { get; init; } = new();
}

public sealed class RadioPayload
{
    [JsonRequired]
    [JsonPropertyName("count")]
    public int Count { get; init; }

    [JsonRequired]
    [JsonPropertyName("b")]
    public int BatteryPercent { get; init; }

    [JsonRequired]
    [JsonPropertyName("t")]
    public double? Temperature { get; init; }
}
