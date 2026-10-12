namespace TaskManagementSystem.Entities;

/// <summary>
/// Kayıt sırasında kullanıcının seçtiği ekip yolu.
///
/// İki seçenek aynı formdan geldiği için hangi alanların zorunlu olduğunu
/// bu değer belirliyor (bkz. <see cref="DTOs.RegisterRequest"/>).
/// </summary>
public enum TeamJoinMode
{
    /// <summary>Yeni ekip kurar; kullanıcı ekibin sahibi olur.</summary>
    CreateTeam = 0,

    /// <summary>Ekip koduyla var olan ekibe katılır.</summary>
    JoinTeam = 1
}
