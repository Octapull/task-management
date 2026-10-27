namespace TaskManagementSystem.DTOs;

/// <summary>
/// Etiketlerde kullanılabilecek renk adları.
///
/// Serbest renk kodu (#ff0000) bilerek kabul edilmiyor: kullanıcı koyu temada
/// okunmayan bir renk seçebilir ve arayüzün rengi kendi değişkenlerinden
/// çözmesi mümkün olmazdı.
/// </summary>
public static class LabelColors
{
    public const string Default = "gray";

    private static readonly HashSet<string> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        "gray", "blue", "green", "yellow", "orange", "red", "purple", "teal",
    };

    /// <summary>Geçerliyse küçük harfe indirir, değilse varsayılanı döner.</summary>
    public static string Normalize(string? color)
    {
        if (string.IsNullOrWhiteSpace(color)) return Default;

        var trimmed = color.Trim().ToLowerInvariant();

        return Allowed.Contains(trimmed) ? trimmed : Default;
    }
}
