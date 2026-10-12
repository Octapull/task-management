namespace TaskManagementSystem.Entities;

/// <summary>
/// Bir ekip. Sistemdeki bütün veri (işler, geçmiş, kullanıcılar) bir ekibe ait
/// ve ekipler birbirinin verisini göremiyor.
/// </summary>
public class Team
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Ekibe katılmak isteyene paylaşılan kod. Benzersiz; üretimi
    /// <see cref="Services.TeamCodeGenerator"/> içinde.
    /// </summary>
    public string TeamCode { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
