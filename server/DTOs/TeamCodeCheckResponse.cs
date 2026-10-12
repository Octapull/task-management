namespace TaskManagementSystem.DTOs;

/// <summary>
/// Ekip kodu doğrulama sonucu (GET /api/teams/validate-code/{code}).
///
/// Kod yanlışsa 404 yerine <c>valid: false</c> dönüyoruz: bu uç nokta form
/// yazılırken her tuşta çağrılıyor, konsolu 404'lerle doldurmanın anlamı yok.
/// </summary>
public class TeamCodeCheckResponse
{
    public bool Valid { get; set; }

    /// <summary>Kod geçerliyse ekibin adı; değilse null.</summary>
    public string? TeamName { get; set; }

    /// <summary>Kod geçerliyse ekipteki üye sayısı; değilse null.</summary>
    public int? MemberCount { get; set; }
}
