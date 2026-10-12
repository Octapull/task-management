namespace TaskManagementSystem.Services;

/// <summary>
/// Gönderimi bekleyen e-postalar.
///
/// Doğrulama kodu doğrudan gönderiliyor çünkü kullanıcı zaten onu bekliyor.
/// Bildirimler ise kimsenin beklemediği yan işler: atama sürükle-bırakla
/// tetikleniyor ve SMTP sunucusunun yavaşlığı isteği geciktirmemeli.
/// </summary>
public interface IEmailQueue
{
    /// <summary>
    /// Postayı kuyruğa alır ve hemen döner. Kuyruk doluysa en eski mesaj
    /// düşürülür - bildirim kaybetmek, istek zincirini tıkamaktan iyidir.
    /// </summary>
    void Enqueue(EmailMessage message);
}
