using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

public class ResendCodeRequest
{
    [Required(ErrorMessage = "E-posta gerekli.")]
    [EmailAddress(ErrorMessage = "Geçerli bir e-posta adresi gir.")]
    public string Email { get; set; } = string.Empty;
}
