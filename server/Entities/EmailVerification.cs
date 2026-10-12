namespace TaskManagementSystem.Entities;

/// <summary>
/// E-postaya gönderilen tek kullanımlık doğrulama kodu.
///
/// Kod kullanıcı kaydının üzerinde değil ayrı bir tabloda tutuluyor: aynı
/// kişiye birden fazla kod gönderilebiliyor (yeniden gönder) ve "kaç kez
/// istendi, ne zaman istendi" bilgisi hız sınırı için gerekli.
/// </summary>
public class EmailVerification
{
    public int Id { get; set; }

    public int UserId { get; set; }

    /// <summary>Kodun gönderildiği adres.</summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>6 haneli sayısal kod.</summary>
    public string Code { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }

    /// <summary>Doğrulamada kullanılmış kod tekrar kabul edilmez.</summary>
    public bool IsUsed { get; set; }

    public DateTime CreatedAt { get; set; }
}
