using System.ComponentModel.DataAnnotations;
using TaskManagementSystem.DTOs;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Tests;

/// <summary>
/// Kayıt formunda hangi alanın zorunlu olduğu seçilen moda bağlı. Kural
/// [Required] ile ifade edilemediği için elle yazıldı; iki modun da kendi
/// alanını istediği ve diğerini istemediği burada sabitleniyor.
/// </summary>
public class RegisterRequestValidationTests
{
    private static List<ValidationResult> Validate(RegisterRequest request)
    {
        var results = new List<ValidationResult>();

        Validator.TryValidateObject(
            request,
            new ValidationContext(request),
            results,
            validateAllProperties: true);

        return results;
    }

    private static RegisterRequest ValidBase() => new()
    {
        FullName = "Ayşe Yılmaz",
        Email = "ayse@ornek.com",
        Password = "sifre123",
    };

    [Fact]
    public void Ekip_kurma_modunda_ekip_adi_zorunlu()
    {
        var request = ValidBase();
        request.Mode = TeamJoinMode.CreateTeam;
        request.TeamName = null;

        Assert.Contains(
            Validate(request),
            result => result.MemberNames.Contains(nameof(RegisterRequest.TeamName)));
    }

    [Fact]
    public void Ekip_kurma_modunda_tek_harflik_ad_reddedilir()
    {
        var request = ValidBase();
        request.Mode = TeamJoinMode.CreateTeam;
        request.TeamName = "A";

        Assert.NotEmpty(Validate(request));
    }

    [Fact]
    public void Ekip_kurma_modunda_ekip_kodu_istenmez()
    {
        var request = ValidBase();
        request.Mode = TeamJoinMode.CreateTeam;
        request.TeamName = "Tasarım Ekibi";
        request.TeamCode = null;

        Assert.Empty(Validate(request));
    }

    [Fact]
    public void Katilma_modunda_ekip_kodu_zorunlu()
    {
        var request = ValidBase();
        request.Mode = TeamJoinMode.JoinTeam;
        request.TeamCode = null;

        Assert.Contains(
            Validate(request),
            result => result.MemberNames.Contains(nameof(RegisterRequest.TeamCode)));
    }

    [Fact]
    public void Katilma_modunda_kisa_kod_reddedilir()
    {
        var request = ValidBase();
        request.Mode = TeamJoinMode.JoinTeam;
        request.TeamCode = "ABC";

        Assert.NotEmpty(Validate(request));
    }

    [Fact]
    public void Katilma_modunda_ekip_adi_istenmez()
    {
        var request = ValidBase();
        request.Mode = TeamJoinMode.JoinTeam;
        request.TeamCode = "ABCD2345";
        request.TeamName = null;

        Assert.Empty(Validate(request));
    }

    [Theory]
    [InlineData("", "sifre123")]
    [InlineData("gecersiz-eposta", "sifre123")]
    [InlineData("ayse@ornek.com", "kisa")]
    public void Temel_alan_kurallari_moddan_bagimsiz_uygulanir(
        string email,
        string password)
    {
        var request = ValidBase();
        request.Email = email;
        request.Password = password;
        request.Mode = TeamJoinMode.CreateTeam;
        request.TeamName = "Tasarım Ekibi";

        Assert.NotEmpty(Validate(request));
    }
}
