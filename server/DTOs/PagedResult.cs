namespace TaskManagementSystem.DTOs;

/// <summary>
/// Sayfalanmış liste yanıtı.
///
/// Toplam sayı da dönüyor: istemci "daha fazla var mı" sorusunu boş bir
/// sayfa çekerek değil, doğrudan buradan öğreniyor.
/// </summary>
public class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];

    /// <summary>Filtreye uyan toplam kayıt sayısı (sayfa değil, tümü).</summary>
    public int Total { get; init; }

    public int Skip { get; init; }
    public int Take { get; init; }

    /// <summary>Bu sayfadan sonra daha kayıt var mı?</summary>
    public bool HasMore => Skip + Items.Count < Total;
}
