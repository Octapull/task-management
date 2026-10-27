namespace TaskManagementSystem.DTOs;

/// <summary>Kullanıcının kendi ekibi (GET /api/teams/me).</summary>
public class TeamSummary
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Ekibe davet için paylaşılan kod.</summary>
    public string TeamCode { get; set; } = string.Empty;

    public int MemberCount { get; set; }
    public DateTime CreatedAt { get; set; }
}
