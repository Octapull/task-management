using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TaskManagementSystem.Extensions;

namespace TaskManagementSystem.Hubs;

/// <summary>
/// Anlık bildirim kanalı.
///
/// İstemcinin çağırabileceği bir metot yok; Hub yalnızca sunucudan istemciye
/// yayın yapmak için var. Bağlanan herkes kendi ekibinin grubuna alınıyor,
/// böylece bir ekibin işlerindeki değişiklik diğer ekiplere sızmıyor.
/// </summary>
[Authorize]
public class TaskHub : Hub
{
    /// <summary>Bir ekibin yayın grubunun adı.</summary>
    public static string TeamGroup(int teamId) => $"team-{teamId}";

    public override async Task OnConnectedAsync()
    {
        var teamId = Context.User?.GetTeamId() ?? 0;

        // Ekipsiz token (eski oturumlar) hiçbir gruba girmiyor: bağlantı
        // kurulur ama bildirim almaz. Kullanıcı yeniden giriş yaptığında
        // token'a ekip claim'i eklenmiş olacak.
        if (teamId > 0)
            await Groups.AddToGroupAsync(Context.ConnectionId, TeamGroup(teamId));

        await base.OnConnectedAsync();
    }

    // Gruptan çıkarma gerekmiyor: SignalR bağlantı koptuğunda üyeliği
    // kendisi temizliyor.
}
