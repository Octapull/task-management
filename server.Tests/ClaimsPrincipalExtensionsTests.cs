using System.Security.Claims;
using TaskManagementSystem.Entities;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Tests;

/// <summary>
/// Ekip izolasyonunun tamamı bu iki okumaya dayanıyor: sorgular
/// <see cref="ClaimsPrincipalExtensions.GetTeamId"/> ile filtreleniyor,
/// silme yetkisi <see cref="ClaimsPrincipalExtensions.IsOwner"/> ile
/// belirleniyor. Hatalı bir okuma veri sızdırır, bu yüzden sınır durumlar
/// tek tek sabitleniyor.
/// </summary>
public class ClaimsPrincipalExtensionsTests
{
    private static ClaimsPrincipal Principal(params Claim[] claims) =>
        new(new ClaimsIdentity(claims, authenticationType: "Test"));

    [Fact]
    public void GetUserId_token_daki_kimligi_okur()
    {
        var user = Principal(new Claim(ClaimTypes.NameIdentifier, "42"));

        Assert.Equal(42, user.GetUserId());
    }

    [Fact]
    public void GetUserId_claim_yoksa_sifir_doner()
    {
        Assert.Equal(0, Principal().GetUserId());
    }

    [Fact]
    public void GetUserId_sayi_olmayan_degerde_sifir_doner()
    {
        var user = Principal(new Claim(ClaimTypes.NameIdentifier, "abc"));

        Assert.Equal(0, user.GetUserId());
    }

    [Fact]
    public void GetTeamId_token_daki_ekibi_okur()
    {
        var user = Principal(new Claim(AppClaimTypes.TeamId, "7"));

        Assert.Equal(7, user.GetTeamId());
    }

    [Fact]
    public void GetTeamId_claim_yoksa_sifir_doner()
    {
        // 0 "hiçbir ekibe ait değil" demek: bu değerle yapılan sorgular
        // hiçbir satır getirmiyor, yani başka ekibin verisine düşmüyor.
        Assert.Equal(0, Principal().GetTeamId());
    }

    [Fact]
    public void IsOwner_Owner_rolunde_true_doner()
    {
        var user = Principal(new Claim(ClaimTypes.Role, nameof(UserRole.Owner)));

        Assert.True(user.IsOwner());
    }

    [Fact]
    public void IsOwner_Member_rolunde_false_doner()
    {
        var user = Principal(new Claim(ClaimTypes.Role, nameof(UserRole.Member)));

        Assert.False(user.IsOwner());
    }

    [Fact]
    public void IsOwner_rol_claim_i_yoksa_false_doner()
    {
        // Yetki varsayılan olarak kapalı olmalı.
        Assert.False(Principal().IsOwner());
    }
}
