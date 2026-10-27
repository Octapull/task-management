using System.ComponentModel.DataAnnotations;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.DTOs;

/// <summary>
/// Mevcut bir işin içeriğini güncelleme gövdesi.
/// Durum ve atama ayrı uç noktalardan yönetiliyor, burada yer almaz.
/// </summary>
public class UpdateTaskRequest
{
    [Required(ErrorMessage = "Başlık gerekli.")]
    [StringLength(200, MinimumLength = 3,
        ErrorMessage = "Başlık 3-200 karakter arasında olmalı.")]
    public string Title { get; set; } = string.Empty;

    [StringLength(2000, ErrorMessage = "Açıklama en fazla 2000 karakter olabilir.")]
    public string Description { get; set; } = string.Empty;

    [EnumDataType(typeof(TaskPriority), ErrorMessage = "Geçersiz öncelik değeri.")]
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;

    public DateTime? DueDate { get; set; }
}
