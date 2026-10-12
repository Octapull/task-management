namespace TaskManagementSystem.Services;

/// <summary>
/// Kuyruktaki e-postaları sırayla gönderen arka plan servisi.
///
/// Tek okuyucu var: aynı anda birden fazla SMTP bağlantısı açmak çoğu
/// sağlayıcıda hız sınırına takılıyor ve bildirimlerin sırası zaten önemsiz.
/// </summary>
public class EmailBackgroundSender : BackgroundService
{
    private readonly EmailQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EmailBackgroundSender> _logger;

    public EmailBackgroundSender(
        EmailQueue queue,
        IServiceScopeFactory scopeFactory,
        ILogger<EmailBackgroundSender> logger)
    {
        _queue = queue;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var message in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                // IEmailService scoped; bu servis singleton olduğu için her
                // gönderim kendi kapsamını açıyor.
                using var scope = _scopeFactory.CreateScope();
                var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

                await emailService.SendAsync(message, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Uygulama kapanıyor; kalan mesajlar bilerek gönderilmiyor.
                break;
            }
            catch (Exception ex)
            {
                // Tek bir başarısız bildirim döngüyü durdurmamalı.
                _logger.LogError(ex, "Bildirim e-postası gönderilemedi: {To}", message.To);
            }
        }
    }
}
