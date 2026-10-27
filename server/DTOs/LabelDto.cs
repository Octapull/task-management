namespace TaskManagementSystem.DTOs;

public class LabelDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Renk adı - arayüz bunu kendi tema değişkenine çeviriyor.</summary>
    public string Color { get; set; } = LabelColors.Default;

    /// <summary>Bu etiketin kaç işte kullanıldığı; silmeden önce uyarmak için.</summary>
    public int UsageCount { get; set; }
}
