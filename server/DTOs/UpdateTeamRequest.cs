using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

public class UpdateTeamRequest
{
    [Required(ErrorMessage = "Ekip adı gerekli.")]
    [StringLength(120, MinimumLength = 2,
        ErrorMessage = "Ekip adı 2-120 karakter arasında olmalı.")]
    public string Name { get; set; } = string.Empty;
}
