namespace TaskManagementSystem.Services;

/// <summary>
/// Giden e-posta. Arkasında iki implementasyon var:
/// <see cref="LoggingEmailService"/> (geliştirme) ve
/// <see cref="SmtpEmailService"/> (gerçek gönderim). Hangisinin kullanılacağı
/// appsettings > Email:Provider ile seçiliyor.
/// </summary>
public interface IEmailService
{
    /// <summary>
    /// Gönderim yapamazsa istisna fırlatmaz, false döner: doğrulama kodu
    /// veritabanına zaten yazılmış oluyor ve SMTP'nin geçici arızası
    /// yüzünden kaydın tamamını geri almanın anlamı yok.
    /// </summary>
    Task<bool> SendAsync(EmailMessage message, CancellationToken cancellationToken = default);

    /// <summary>
    /// Kod, gönderilen yanıtın içine de konabilir mi? Yalnızca gerçek posta
    /// gönderimi yapılmayan geliştirme modunda true.
    /// </summary>
    bool ExposesCodeForDevelopment { get; }
}

/// <summary>Gönderilecek tek bir e-posta.</summary>
public class EmailMessage
{
    public string To { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;

    /// <summary>HTML gövde.</summary>
    public string HtmlBody { get; set; } = string.Empty;

    /// <summary>HTML görüntüleyemeyen istemciler için düz metin karşılığı.</summary>
    public string TextBody { get; set; } = string.Empty;
}
