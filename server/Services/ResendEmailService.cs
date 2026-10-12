using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace TaskManagementSystem.Services;

/// <summary>
/// Resend üzerinden gönderim. appsettings > Email:Provider "Resend"
/// olduğunda devreye giriyor.
///
/// SMTP yerine HTTPS: barındırma sağlayıcılarının çoğu giden 25/465/587
/// portlarını kapatıyor ve SmtpClient bu durumda hata vermeden zaman
/// aşımına kadar bekliyor - kayıt isteği 100 saniye asılı kalıyordu.
/// 443 her yerde açık.
/// </summary>
public class ResendEmailService : IEmailService
{
    /// <summary>IHttpClientFactory'deki adlandırılmış istemci.</summary>
    public const string HttpClientName = "resend";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly EmailOptions _options;
    private readonly ILogger<ResendEmailService> _logger;

    public ResendEmailService(
        IHttpClientFactory httpClientFactory,
        IOptions<EmailOptions> options,
        ILogger<ResendEmailService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>Posta gerçekten gidiyor; kodu yanıta koymak sızıntı olurdu.</summary>
    public bool ExposesCodeForDevelopment => false;

    public async Task<bool> SendAsync(
        EmailMessage message,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _options.Resend.ApiKey;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogError(
                "Email:Provider 'Resend' seçili ama Email:Resend:ApiKey boş - posta gönderilemedi.");
            return false;
        }

        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", apiKey);

            var payload = new ResendRequest
            {
                // "Ad <adres>" biçimi: alıcı gönderen adını görsün.
                From = $"{_options.FromName} <{_options.FromAddress}>",
                To = [message.To],
                Subject = message.Subject,
                Html = message.HtmlBody,
                Text = message.TextBody,
            };

            using var response = await client.PostAsJsonAsync("emails", payload, cancellationToken);

            if (response.IsSuccessStatusCode)
                return true;

            // Resend hatayı gövdede açıklıyor (doğrulanmamış alan adı, geçersiz
            // anahtar, kota...). Log'a almazsak elimizde yalnızca durum kodu kalır.
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            _logger.LogError(
                "Resend e-postayı kabul etmedi ({StatusCode}): {Body} - alıcı: {To}",
                (int)response.StatusCode, body, message.To);

            return false;
        }
        catch (Exception ex)
        {
            // Kod veritabanına zaten yazıldı; geçici bir ağ arızası yüzünden
            // kaydın tamamını geri almıyoruz, kullanıcı "yeniden gönder"
            // diyerek tekrar deneyebilir.
            _logger.LogError(ex, "Doğrulama e-postası gönderilemedi: {To}", message.To);
            return false;
        }
    }

    /// <summary>
    /// Resend'in POST /emails gövdesi. Alan adları snake_case değil camelCase
    /// olduğu için varsayılan adlandırma yeterli, yalnızca isimleri sabitliyoruz.
    /// </summary>
    private sealed class ResendRequest
    {
        [JsonPropertyName("from")]
        public string From { get; set; } = string.Empty;

        [JsonPropertyName("to")]
        public string[] To { get; set; } = [];

        [JsonPropertyName("subject")]
        public string Subject { get; set; } = string.Empty;

        [JsonPropertyName("html")]
        public string Html { get; set; } = string.Empty;

        [JsonPropertyName("text")]
        public string Text { get; set; } = string.Empty;
    }
}
