using System.Data;
using System.Security.Cryptography;
using Dapper;

namespace TaskManagementSystem.Services;

/// <summary>
/// Ekip davet kodu üretimi.
///
/// Alfabede I, L, O, 0 ve 1 bilerek yok: kod çoğu zaman sözlü olarak ya da
/// elle yazılarak paylaşılıyor, bu karakterler birbirine karışıyor.
/// </summary>
public static class TeamCodeGenerator
{
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const int CodeLength = 8;

    /// <summary>
    /// Çakışmayan bir kod üretir. Alfabe 31 karakter ve kod 8 hane olduğu
    /// için çakışma ihtimali pratikte yok denecek kadar az; yine de UNIQUE
    /// kısıtına takılıp 500 dönmektense birkaç deneme yapıyoruz.
    /// </summary>
    public static async Task<string> CreateUniqueAsync(IDbConnection connection)
    {
        const string existsSql = "SELECT COUNT(1) FROM teams WHERE team_code = @Code";

        for (var attempt = 0; attempt < 10; attempt++)
        {
            var code = Create();
            var taken = await connection.QuerySingleAsync<int>(existsSql, new { Code = code });

            if (taken == 0) return code;
        }

        throw new InvalidOperationException(
            "Benzersiz ekip kodu üretilemedi - 10 denemenin hepsi çakıştı.");
    }

    /// <summary>
    /// Rastgele tek bir kod. Random yerine RandomNumberGenerator: kod bir
    /// davet anahtarı, tahmin edilebilir olmamalı.
    /// </summary>
    internal static string Create()
    {
        var buffer = new char[CodeLength];

        for (var i = 0; i < CodeLength; i++)
            buffer[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];

        return new string(buffer);
    }

    /// <summary>
    /// Kullanıcının girdiği kodu karşılaştırmaya hazır hale getirir:
    /// boşluklar atılır, harfler büyütülür.
    /// </summary>
    public static string Normalize(string? code) =>
        (code ?? string.Empty).Trim().Replace(" ", string.Empty).ToUpperInvariant();
}
