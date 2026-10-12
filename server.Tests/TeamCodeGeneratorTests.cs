using TaskManagementSystem.Services;

namespace TaskManagementSystem.Tests;

/// <summary>
/// Davet kodu sözlü olarak ya da elle yazılarak paylaşılıyor; alfabedeki
/// kısıt bunun için var. Bir harfin geri sızması testte yakalanmazsa
/// "kodu yanlış yazdım" şikayetleri olarak geri döner.
/// </summary>
public class TeamCodeGeneratorTests
{
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    [Fact]
    public void Kod_sekiz_hane()
    {
        Assert.Equal(8, TeamCodeGenerator.Create().Length);
    }

    [Fact]
    public void Kod_yalnizca_izin_verilen_karakterleri_icerir()
    {
        // Tek bir kod şanslı çıkabilir; çok sayıda üretip bakıyoruz.
        for (var i = 0; i < 500; i++)
        {
            var code = TeamCodeGenerator.Create();

            Assert.All(code, character => Assert.Contains(character, Alphabet));
        }
    }

    [Theory]
    [InlineData('I')]
    [InlineData('L')]
    [InlineData('O')]
    [InlineData('0')]
    [InlineData('1')]
    public void Karistirilabilir_karakterler_hic_gecmez(char forbidden)
    {
        for (var i = 0; i < 500; i++)
        {
            Assert.DoesNotContain(forbidden, TeamCodeGenerator.Create());
        }
    }

    [Fact]
    public void Ardisik_kodlar_farkli()
    {
        var codes = Enumerable
            .Range(0, 200)
            .Select(_ => TeamCodeGenerator.Create())
            .ToHashSet();

        // 31^8 olasılık içinde 200 üretimde çakışma pratikte imkânsız;
        // çakışma çıkarsa üretici rastgele değil demektir.
        Assert.Equal(200, codes.Count);
    }
}
