namespace TaskManagementSystem.Entities;

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    // Şifre asla düz metin tutulmaz, her zaman hash'lenmiş hali saklanır (örn. BCrypt.Net ile).
    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; } = UserRole.Member;

    /// <summary>
    /// Kullanıcının ait olduğu ekip. Sütun sonradan eklendiği için tipte
    /// nullable; kayıt akışı her yeni kullanıcıya mutlaka bir ekip atıyor.
    /// </summary>
    public int? TeamId { get; set; }

    /// <summary>
    /// E-posta doğrulanana kadar false. Bu haldeki hesap giriş yapamaz,
    /// giriş denemesi doğrudan kod ekranına yönlendirilir.
    /// </summary>
    public bool IsEmailConfirmed { get; set; }

    public DateTime CreatedAt { get; set; }
}
