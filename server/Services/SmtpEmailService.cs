using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Options;

namespace TaskManagementSystem.Services;

/// <summary>
/// Gerçek gönderim. appsettings > Email:Provider "Smtp" olduğunda devreye
/// giriyor ve ayarları Email:Smtp altından okuyor.
/// </summary>
public class SmtpEmailService : IEmailService
{
    private readonly EmailOptions _options;
    private readonly ILogger<SmtpEmailService> _logger;

    public SmtpEmailService(IOptions<EmailOptions> options, ILogger<SmtpEmailService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>Posta gerçekten gidiyor; kodu yanıta koymak sızıntı olurdu.</summary>
    public bool ExposesCodeForDevelopment => false;

    public async Task<bool> SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        var smtp = _options.Smtp;

        if (string.IsNullOrWhiteSpace(smtp.Host))
        {
            _logger.LogError(
                "Email:Provider 'Smtp' seçili ama Email:Smtp:Host boş - posta gönderilemedi.");
            return false;
        }

        try
        {
            using var client = new SmtpClient(smtp.Host, smtp.Port)
            {
                EnableSsl = smtp.EnableSsl,
                // Kimlik bilgisi verilmediyse anonim gönderim denenir; bazı
                // iç ağ sunucuları böyle çalışıyor.
                Credentials = string.IsNullOrWhiteSpace(smtp.UserName)
                    ? CredentialCache.DefaultNetworkCredentials
                    : new NetworkCredential(smtp.UserName, smtp.Password),
                // Varsayılan 100 saniye: giden SMTP portu kapalı olan bir
                // ortamda (birçok bulut sağlayıcısı engelliyor) bağlantı hata
                // vermeden asılı kalıyor ve kayıt isteği o kadar bekliyor.
                Timeout = smtp.TimeoutSeconds * 1000,
            };

            using var mail = new MailMessage
            {
                From = new MailAddress(_options.FromAddress, _options.FromName),
                Subject = message.Subject,
                Body = message.HtmlBody,
                IsBodyHtml = true,
            };

            mail.To.Add(message.To);

            // HTML görüntüleyemeyen istemciler düz metin karşılığını görsün.
            mail.AlternateViews.Add(
                AlternateView.CreateAlternateViewFromString(
                    message.TextBody, null, "text/plain"));

            await client.SendMailAsync(mail, cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            // Kod veritabanına zaten yazıldı; SMTP'nin geçici arızası yüzünden
            // kaydın tamamını geri almıyoruz, kullanıcı "yeniden gönder"
            // diyerek tekrar deneyebilir.
            _logger.LogError(ex, "Doğrulama e-postası gönderilemedi: {To}", message.To);
            return false;
        }
    }
}
