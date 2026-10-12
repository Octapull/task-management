using TaskManagementSystem.DTOs;

namespace TaskManagementSystem.Tests;

/// <summary>
/// İstemcideki "Daha fazla yükle" butonu doğrudan <c>HasMore</c>'a bakıyor.
/// Yanlış hesaplanırsa ya buton hiç çıkmaz (eski geçmiş erişilemez kalır) ya
/// da hep çıkıp boş sayfa çeker.
/// </summary>
public class PagedResultTests
{
    private static PagedResult<int> Page(int itemCount, int total, int skip) =>
        new()
        {
            Items = Enumerable.Range(0, itemCount).ToList(),
            Total = total,
            Skip = skip,
            Take = 50,
        };

    [Fact]
    public void Ilk_sayfa_toplamin_altindaysa_devami_var()
    {
        Assert.True(Page(itemCount: 50, total: 120, skip: 0).HasMore);
    }

    [Fact]
    public void Son_sayfada_devami_yok()
    {
        // 100 atlanmış + 20 gelmiş = 120, yani toplam tamamlandı.
        Assert.False(Page(itemCount: 20, total: 120, skip: 100).HasMore);
    }

    [Fact]
    public void Tam_bolunen_son_sayfada_devami_yok()
    {
        Assert.False(Page(itemCount: 50, total: 100, skip: 50).HasMore);
    }

    [Fact]
    public void Bos_sonucta_devami_yok()
    {
        Assert.False(Page(itemCount: 0, total: 0, skip: 0).HasMore);
    }

    [Fact]
    public void Sinirin_otesine_atlandiginda_devami_yok()
    {
        // Kayıt silinip toplam küçülmüş olabilir; buton yine de kapanmalı.
        Assert.False(Page(itemCount: 0, total: 10, skip: 500).HasMore);
    }

    [Fact]
    public void Items_verilmezse_bos_liste_olur()
    {
        var page = new PagedResult<int>();

        Assert.Empty(page.Items);
        Assert.False(page.HasMore);
    }
}
