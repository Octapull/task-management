namespace TaskManagementSystem.DTOs;

/// <summary>
/// Kullanıcı listesinde ve iş atama seçiminde kullanılan özet bilgi.
/// Şifre hash'i, e-posta ve kayıt tarihi bilerek dışarı verilmiyor -
/// arayüzün ihtiyacı olan tek şey kim olduğu ve adı.
/// </summary>
public class UserSummary
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
}
