using Microsoft.Extensions.Options;

namespace TaskManagementSystem.Services;

/// <summary>appsettings.json > Storage bölümü.</summary>
public class StorageOptions
{
    public const string SectionName = "Storage";

    /// <summary>
    /// Eklerin saklandığı klasör. Göreli verilirse içerik köküne göre çözülür.
    ///
    /// wwwroot'un ALTINDA olmamalı: orası statik dosya olarak sunuluyor ve
    /// dosyalar kimlik doğrulaması olmadan indirilebilir hale gelirdi.
    /// </summary>
    public string AttachmentsPath { get; set; } = "App_Data/attachments";

    /// <summary>Tek dosya için üst sınır (MB).</summary>
    public int MaxFileSizeMb { get; set; } = 10;

    public long MaxFileSizeBytes => Math.Max(1, MaxFileSizeMb) * 1024L * 1024L;
}

/// <summary>Ek dosyalarının diskteki yaşam döngüsü.</summary>
public interface IAttachmentStorage
{
    /// <summary>
    /// Dosyayı diske yazar ve ürettiği depolama adını döner. Bu ad
    /// veritabanına kaydediliyor; kullanıcının verdiği ad diskte kullanılmıyor.
    /// </summary>
    Task<string> SaveAsync(Stream content, CancellationToken cancellationToken = default);

    /// <summary>Okuma akışı; dosya yoksa null.</summary>
    Stream? OpenRead(string storedName);

    /// <summary>Dosyayı siler. Zaten yoksa sessizce geçer.</summary>
    void Delete(string storedName);

    long MaxFileSizeBytes { get; }
}

/// <inheritdoc />
public class AttachmentStorage : IAttachmentStorage
{
    private readonly string _root;
    private readonly StorageOptions _options;
    private readonly ILogger<AttachmentStorage> _logger;

    public AttachmentStorage(
        IOptions<StorageOptions> options,
        IHostEnvironment environment,
        ILogger<AttachmentStorage> logger)
    {
        _options = options.Value;
        _logger = logger;

        _root = Path.IsPathRooted(_options.AttachmentsPath)
            ? _options.AttachmentsPath
            : Path.Combine(environment.ContentRootPath, _options.AttachmentsPath);

        Directory.CreateDirectory(_root);
    }

    public long MaxFileSizeBytes => _options.MaxFileSizeBytes;

    public async Task<string> SaveAsync(
        Stream content,
        CancellationToken cancellationToken = default)
    {
        // Ad tamamen sunucu tarafından üretiliyor: kullanıcının verdiği adda
        // ".." ya da yol ayıracı olabilir, ayrıca aynı ad iki kez yüklenebilir.
        var storedName = $"{Guid.NewGuid():N}.bin";

        var path = Path.Combine(_root, storedName);

        await using var target = new FileStream(
            path,
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 81920,
            useAsync: true);

        await content.CopyToAsync(target, cancellationToken);

        return storedName;
    }

    public Stream? OpenRead(string storedName)
    {
        var path = ResolvePath(storedName);
        if (path is null || !File.Exists(path)) return null;

        return new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 81920,
            useAsync: true);
    }

    public void Delete(string storedName)
    {
        var path = ResolvePath(storedName);
        if (path is null) return;

        try
        {
            File.Delete(path);
        }
        catch (Exception ex)
        {
            // Dosya silinemezse kayıt yine de gitmeli: diskte artık kimsenin
            // ulaşamadığı bir dosya kalması, ekranda hayalet satır kalmasından iyi.
            _logger.LogError(ex, "Ek dosyası silinemedi: {StoredName}", storedName);
        }
    }

    /// <summary>
    /// Depolama adını tam yola çevirir.
    ///
    /// Ad veritabanından geliyor ve bizim ürettiğimiz bir GUID, ama yine de
    /// doğruluyoruz: kayıt elle değiştirilmiş olabilir ve sonuç yolunun kök
    /// klasörün dışına çıkmadığından emin olmak ucuz bir güvence.
    /// </summary>
    private string? ResolvePath(string storedName)
    {
        if (string.IsNullOrWhiteSpace(storedName)) return null;

        // Yalnızca dosya adı kısmı: içinde yol varsa atılıyor.
        var safeName = Path.GetFileName(storedName);
        if (safeName != storedName) return null;

        var full = Path.GetFullPath(Path.Combine(_root, safeName));
        var rootFull = Path.GetFullPath(_root);

        return full.StartsWith(rootFull, StringComparison.Ordinal) ? full : null;
    }
}
