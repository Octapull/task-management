using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

public class VerifyCodeRequest
{
    [Required(ErrorMessage = "E-posta gerekli.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi gir.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Doğrulama kodu gerekli.")]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Kod 6 haneli olmalı.")]
    public string Code { get; set; } = string.Empty;
}
