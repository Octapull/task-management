using System.ComponentModel.DataAnnotations;

namespace TaskManagementSystem.DTOs;

public class SaveLabelRequest
{
    [Required(ErrorMessage = "Etiket adı gerekli.")]
    [StringLength(40, MinimumLength = 1,
        ErrorMessage = "Etiket adı en fazla 40 karakter olabilir.")]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// İzin verilen renk adlarından biri. Geçersiz bir değer gelirse
    /// varsayılana düşülüyor - istek reddetmek yerine sessizce düzeltmek,
    /// etiket gibi ikincil bir veri için daha az sürtünmeli.
    /// </summary>
    public string Color { get; set; } = LabelColors.Default;
}
