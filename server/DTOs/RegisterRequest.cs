using System.ComponentModel.DataAnnotations;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// Kayıt isteği. Kişisel bilgilerin yanında kullanıcının hangi ekip yolunu
/// seçtiğini de taşıyor: yeni ekip kurmak ya da koda sahip olduğu ekibe
/// katılmak.
/// </summary>
public class RegisterRequest : IValidatableObject
{
    // Doğrulama kuralları burada duruyor çünkü istemci tarafındaki kontroller
    // (Angular formu) atlatılabilir - API'ye doğrudan istek atılabilir.
    [Required(ErrorMessage = "Ad soyad gerekli.")]
    [StringLength(150, MinimumLength = 3,
        ErrorMessage = "Ad soyad 3-150 karakter arasında olmalı.")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "E-posta gerekli.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi gir.")]
    [StringLength(150, ErrorMessage = "E-posta en fazla 150 karakter olabilir.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Şifre gerekli.")]
    [StringLength(100, MinimumLength = 6,
        ErrorMessage = "Şifre en az 6 karakter olmalı.")]
    public string Password { get; set; } = string.Empty;

    /// <summary>Yeni ekip mi kuruluyor, var olana mı katılınıyor?</summary>
    public TeamJoinMode Mode { get; set; } = TeamJoinMode.CreateTeam;

    /// <summary>Yalnızca <see cref="TeamJoinMode.CreateTeam"/> modunda dolu.</summary>
    [StringLength(120, ErrorMessage = "Ekip adı en fazla 120 karakter olabilir.")]
    public string? TeamName { get; set; }

    /// <summary>Yalnızca <see cref="TeamJoinMode.JoinTeam"/> modunda dolu.</summary>
    [StringLength(12, ErrorMessage = "Ekip kodu en fazla 12 karakter olabilir.")]
    public string? TeamCode { get; set; }

    /// <summary>
    /// Hangi alanın zorunlu olduğu seçilen moda bağlı, bu yüzden tek tek
    /// [Required] yerine burada kontrol ediliyor. Aksi halde ekip adı da
    /// ekip kodu da her iki modda zorunlu görünürdü.
    /// </summary>
    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (Mode == TeamJoinMode.CreateTeam)
        {
            var name = TeamName?.Trim();

            if (string.IsNullOrEmpty(name) || name.Length < 2)
            {
                yield return new ValidationResult(
                    "Ekip adı en az 2 karakter olmalı.", [nameof(TeamName)]);
            }
        }
        else
        {
            var code = TeamCode?.Trim();

            if (string.IsNullOrEmpty(code) || code.Length < 6)
            {
                yield return new ValidationResult(
                    "Ekip kodu en az 6 karakter olmalı.", [nameof(TeamCode)]);
            }
        }
    }
}
