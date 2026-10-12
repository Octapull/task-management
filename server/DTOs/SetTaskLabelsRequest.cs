namespace TaskManagementSystem.DTOs;

/// <summary>
/// İşin etiketlerinin tamamı.
///
/// Tek tek ekle/çıkar yerine tam liste gönderiliyor: arayüzde birden fazla
/// kutu aynı anda işaretlenebiliyor ve son hâli kaydetmek en az sürprizli yol.
/// </summary>
public class SetTaskLabelsRequest
{
    public int[] LabelIds { get; set; } = [];
}
