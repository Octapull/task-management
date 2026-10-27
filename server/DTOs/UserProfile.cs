namespace TaskManagementSystem.DTOs;

/// <summary>
/// Kullanıcının kendi profil bilgisi (GET /api/users/me).
///
/// <see cref="UserSummary"/>'den farkı e-posta, ekip ve kayıt tarihini de
/// taşıması - bunlar yalnızca kişinin kendisine gösteriliyor, ekip listesinde
/// değil.
/// </summary>
public class UserProfile
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;

    public int? TeamId { get; set; }
    public string? TeamName { get; set; }

    /// <summary>Davet kodu - profil ekranında kopyalanabiliyor.</summary>
    public string? TeamCode { get; set; }

    /// <summary>Kendisine iş atandığında e-posta gitsin mi?</summary>
    public bool NotifyOnAssignment { get; set; }

    /// <summary>Teslim tarihi yaklaşan/geçen işler için hatırlatma gitsin mi?</summary>
    public bool NotifyOnDueDate { get; set; }

    public DateTime CreatedAt { get; set; }
}
