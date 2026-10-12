using System.Text.RegularExpressions;

namespace TaskManagementSystem.Services;

/// <summary>
/// Geliştirme implementasyonu: hiçbir yere posta göndermez, kodu loga yazar.
///
/// Böylece SMTP sunucusu kurmadan da akışın tamamı denenebiliyor - kod
/// terminaldeki `dotnet run` çıktısında görünüyor.
/// </summary>
public partial class LoggingEmailService : IEmailService
{
    private readonly ILogger<LoggingEmailService> _logger;

    public LoggingEmailService(ILogger<LoggingEmailService> logger)
    {
        _logger = logger;
    }

    /// <summary>Gerçek gönderim yok, kodu yanıtta göstermek güvenli.</summary>
    public bool ExposesCodeForDevelopment => true;

    public Task<bool> SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        // Log satırında HTML'in tamamı işe yaramaz; kullanıcının aradığı tek
        // şey kodun kendisi, onu ayrıca öne çıkarıyoruz.
        var code = CodePattern().Match(message.TextBody).Value;

        _logger.LogInformation(
            """

            ┌─ [MOCK E-POSTA] ────────────────────────────────
            │ Kime   : {To}
            │ Konu   : {Subject}
            │ KOD    : {Code}
            └─────────────────────────────────────────────────
            """,
            message.To,
            message.Subject,
            string.IsNullOrEmpty(code) ? "(yok)" : code);

        return Task.FromResult(true);
    }

    [GeneratedRegex(@"\d{6}")]
    private static partial Regex CodePattern();
}
