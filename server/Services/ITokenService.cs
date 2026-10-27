using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

public interface ITokenService
{
    /// <summary>
    /// Kullanıcı için imzalı JWT üretir.
    /// </summary>
    /// <param name="team">
    /// Verilirse ekip adı da claim olarak eklenir. Verilmezse yalnızca
    /// <see cref="User.TeamId"/> taşınır - arayüz ekip adını zaten
    /// AuthResponse'tan alıyor.
    /// </param>
    string GenerateToken(User user, Team? team = null);
}
