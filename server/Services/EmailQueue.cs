using System.Threading.Channels;

namespace TaskManagementSystem.Services;

/// <inheritdoc />
public class EmailQueue : IEmailQueue
{
    /// <summary>
    /// Sınır bilerek var: SMTP tıkandığında kuyruk sınırsız büyüyüp belleği
    /// tüketmesin. Normal kullanımda bu boyut hiç dolmaz.
    /// </summary>
    private const int Capacity = 500;

    private readonly Channel<EmailMessage> _channel;
    private readonly ILogger<EmailQueue> _logger;

    public EmailQueue(ILogger<EmailQueue> logger)
    {
        _logger = logger;

        _channel = Channel.CreateBounded<EmailMessage>(new BoundedChannelOptions(Capacity)
        {
            // Kuyruk dolduğunda yazan taraf beklemesin: en eskisi düşürülür.
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });
    }

    /// <summary>Arka plan gönderici bu akıştan okuyor.</summary>
    public ChannelReader<EmailMessage> Reader => _channel.Reader;

    public void Enqueue(EmailMessage message)
    {
        if (_channel.Writer.TryWrite(message)) return;

        // DropOldest ile buraya düşmek beklenmiyor; yine de sessiz kalmayalım.
        _logger.LogWarning("E-posta kuyruğa alınamadı: {To}", message.To);
    }
}
