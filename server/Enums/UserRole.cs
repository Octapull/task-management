namespace TaskManagementSystem.Entities;

/// <summary>
/// Kullanıcının ekip içindeki rolü.
///
/// Sayı değerleri eski Admin(0)/Employee(1) ile aynı bırakıldı: veritabanındaki
/// mevcut kayıtların taşınmasına gerek kalmasın diye yalnızca isimler değişti.
/// </summary>
public enum UserRole
{
    /// <summary>Ekibi kuran kişi.</summary>
    Owner = 0,

    /// <summary>Ekip koduyla katılan kişi.</summary>
    Member = 1
}
