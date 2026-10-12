namespace TaskManagementSystem.Services;

/// <summary>
/// Token'a eklediğimiz, standart olmayan claim adları.
///
/// Sabit olarak duruyorlar çünkü aynı metin hem token üretilirken hem de
/// okunurken kullanılıyor; birinde yapılan yazım hatası sessizce "ekipsiz
/// kullanıcı" davranışına dönüşürdü.
/// </summary>
public static class AppClaimTypes
{
    public const string TeamId = "team_id";
    public const string TeamName = "team_name";
}
