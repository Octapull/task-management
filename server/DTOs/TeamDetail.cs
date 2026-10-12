namespace TaskManagementSystem.DTOs;

/// <summary>
/// Ekip yönetimi ekranının verisi (GET /api/teams/me).
///
/// <see cref="TeamSummary"/>'den farkı üye listesini de taşıması. Üyelerin
/// e-postası burada dönüyor ama <see cref="UserSummary"/>'de dönmüyor:
/// atama menüsünün e-postaya ihtiyacı yok, ekip yönetiminin var.
/// </summary>
public class TeamDetail
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Ekibe katılmak için paylaşılan kod.</summary>
    public string TeamCode { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }

    public IReadOnlyList<TeamMember> Members { get; set; } = [];

    /// <summary>İsteği yapan kişi bu ekibin sahibi mi?</summary>
    public bool IsOwner { get; set; }
}

public class TeamMember
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// <summary>"Owner" ya da "Member".</summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>Davet edilip henüz kodunu doğrulamamış üyeler ayırt edilsin.</summary>
    public bool IsEmailConfirmed { get; set; }

    public DateTime CreatedAt { get; set; }
}
