using System.Security.Claims;
using TaskManagementSystem.Entities;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Extensions;

/// <summary>
/// Token'daki kimlik bilgilerini okumanın tek yeri.
///
/// Controller'ların her birinde aynı TryParse kalıbını tekrarlamak yerine
/// burada topluyoruz; ekip filtresi bütün sorgularda aynı kaynaktan besleniyor.
/// </summary>
public static class ClaimsPrincipalExtensions
{
    /// <summary>Token'daki kullanıcı Id'si; yoksa 0.</summary>
    public static int GetUserId(this ClaimsPrincipal principal) =>
        int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0;

    /// <summary>
    /// Token'daki ekip Id'si; yoksa 0.
    ///
    /// 0 dönmesi "hiçbir ekibe ait değil" demek: bu değerle yapılan sorgular
    /// hiçbir satır getirmiyor, yani veri sızdırmak yerine boş sonuç veriyor.
    /// </summary>
    public static int GetTeamId(this ClaimsPrincipal principal) =>
        int.TryParse(principal.FindFirstValue(AppClaimTypes.TeamId), out var id) ? id : 0;

    /// <summary>
    /// Kullanıcı ekibin sahibi mi?
    ///
    /// Rol token'da metin olarak duruyor ("Owner" / "Member"). Enum'a geri
    /// çevirmek yerine IsInRole kullanıyoruz: JWT bearer, ClaimTypes.Role'ü
    /// zaten bu amaçla eşliyor.
    /// </summary>
    public static bool IsOwner(this ClaimsPrincipal principal) =>
        principal.IsInRole(nameof(UserRole.Owner));
}
