namespace TaskManagementSystem.DTOs;

/// <summary>
/// Başarılı giriş/doğrulama yanıtı. Ekip bilgisi de burada dönüyor ki arayüz
/// ayrı bir istek atmadan üst çubukta ekibin adını ve kodunu gösterebilsin.
/// </summary>
public class AuthResponse
{
    /// <summary>Kısa ömürlü erişim token'ı (JWT). İsteklerde taşınan bu.</summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// Uzun ömürlü yenileme token'ı.
    ///
    /// Erişim token'ının süresi dolunca istemci bunu <c>POST /api/auth/refresh</c>
    /// adresine gönderip yeni bir çift alıyor - kullanıcı giriş ekranına
    /// düşmüyor. Her yenilemede değişiyor (döndürme), yani istemci dönen
    /// yeni değeri saklamak zorunda.
    /// </summary>
    public string RefreshToken { get; set; } = string.Empty;

    public DateTime ExpiresAt { get; set; }
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;

    /// <summary>"Owner" ya da "Member".</summary>
    public string Role { get; set; } = string.Empty;

    public int TeamId { get; set; }
    public string TeamName { get; set; } = string.Empty;

    /// <summary>Ekibe davet için paylaşılan kod.</summary>
    public string TeamCode { get; set; } = string.Empty;
}
