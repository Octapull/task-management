namespace TaskManagementSystem.Services;

/// <summary>appsettings.json > Email bölümü.</summary>
public class EmailOptions
{
    public const string SectionName = "Email";

    /// <summary>
    /// "Mock" (loga yazar), "Resend" (HTTPS API ile gönderir) ya da "Smtp"
    /// (SMTP ile gönderir).
    /// </summary>
    public string Provider { get; set; } = "Mock";

    public string FromAddress { get; set; } = "noreply@istakip.local";
    public string FromName { get; set; } = "İş Takip";

    public SmtpOptions Smtp { get; set; } = new();

    public ResendOptions Resend { get; set; } = new();

    /// <summary>Doğrulama kodunun kaç dakika geçerli olacağı.</summary>
    public int CodeLifetimeMinutes { get; set; } = 10;

    /// <summary>İki "yeniden gönder" arasında beklenmesi gereken saniye.</summary>
    public int ResendCooldownSeconds { get; set; } = 60;

    /// <summary>
    /// Bir kodun kaç kez yanlış girilebileceği. Sınır aşıldığında kod iptal
    /// edilir ve kullanıcı yeni kod istemek zorunda kalır.
    /// </summary>
    public int MaxVerificationAttempts { get; set; } = 5;

    /// <summary>
    /// Atama bildirimleri için genel açma/kapama.
    ///
    /// Kullanıcı tercihinden bağımsız: bu kapalıyken kimseye bildirim
    /// gitmiyor. Geliştirme sırasında posta kutusunu doldurmamak için.
    /// </summary>
    public bool NotifyOnAssignment { get; set; } = true;

    /// <summary>
    /// Arayüzün adresi - bildirim e-postasındaki "işi aç" bağlantısı için.
    /// </summary>
    public string AppUrl { get; set; } = "http://localhost:4200";

    /// <summary>Teslim tarihi hatırlatmaları için genel açma/kapama.</summary>
    public bool NotifyOnDueDate { get; set; } = true;

    /// <summary>
    /// Teslim tarihine kaç saat kala "yaklaşıyor" hatırlatması gönderilsin.
    /// </summary>
    public int DueSoonHours { get; set; } = 24;

    /// <summary>
    /// Teslim tarihi taramasının kaç dakikada bir çalışacağı.
    ///
    /// Sık taramanın anlamı yok: hatırlatmanın dakikası değil günü önemli.
    /// </summary>
    public int ReminderScanMinutes { get; set; } = 30;

    public bool UsesSmtp =>
        string.Equals(Provider, "Smtp", StringComparison.OrdinalIgnoreCase);

    public bool UsesResend =>
        string.Equals(Provider, "Resend", StringComparison.OrdinalIgnoreCase);

    /// <summary>Gerçekten posta gönderen sağlayıcılardan biri mi seçili?</summary>
    public bool SendsRealEmail => UsesSmtp || UsesResend;
}

public class ResendOptions
{
    /// <summary>
    /// Resend API anahtarı ("re_" ile başlar). Sır: appsettings.json'a değil
    /// User Secrets'a ya da ortam değişkenine (Email__Resend__ApiKey) yazılır.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    public string BaseUrl { get; set; } = "https://api.resend.com";

    /// <summary>
    /// İstek zaman aşımı. Kısa tutuluyor: kayıt isteği bu gönderimi bekliyor,
    /// sağlayıcı yanıt vermiyorsa kullanıcıyı dakikalarca bekletmek yerine
    /// hata verip "yeniden gönder" imkânı sunmak daha iyi.
    /// </summary>
    public int TimeoutSeconds { get; set; } = 15;
}

public class SmtpOptions
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string UserName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    /// <summary>
    /// Bağlantı ve gönderim için zaman aşımı. .NET'in varsayılanı 100 saniye;
    /// giden SMTP portu engelliyse istek o süre boyunca asılı kalıyor.
    /// </summary>
    public int TimeoutSeconds { get; set; } = 15;
}
