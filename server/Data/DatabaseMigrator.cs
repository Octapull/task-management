using System.Data;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Dapper;
using Microsoft.Extensions.Options;

namespace TaskManagementSystem.Data;

/// <summary>appsettings.json &gt; Database bölümü.</summary>
public class DatabaseOptions
{
    public const string SectionName = "Database";

    /// <summary>
    /// Uygulama açılırken şema kendiliğinden güncellensin mi?
    ///
    /// Varsayılan açık: yeni bir makinede ya da konteynerde tek komutla
    /// çalışan bir kurulum, elle SQL çalıştırma adımından çok daha az hata
    /// üretiyor. Şemayı ayrı bir dağıtım adımında yönetiyorsan kapat.
    /// </summary>
    public bool AutoMigrate { get; set; } = true;
}

/// <summary>
/// Şema kurulumu ve migration'ların uygulanması.
///
/// NEDEN VAR
/// Dapper, EF Core'un aksine migration yönetmiyor. Bu proje şemayı iki
/// biçimde saklıyor:
///
///   * <c>Database/schema.sql</c>      - şemanın bugünkü tam hali
///   * <c>Database/migrations/*.sql</c> - şemayı bugüne getiren adımlar
///
/// Bunları elle çalıştırmak, "hangisi uygulanmıştı?" sorusunu geliştiricinin
/// hafızasına bırakıyordu. Artık uygulanan her dosya <c>schema_migrations</c>
/// tablosuna yazılıyor ve açılışta yalnızca eksikler çalışıyor.
///
/// İKİ FARKLI DURUM
///   1. Boş veritabanı  -> schema.sql çalışır, migration'ların HEPSİ
///      "uygulandı" olarak işaretlenir ama çalıştırılmaz. Çünkü schema.sql
///      zaten hepsinin birleşmiş sonucu; tekrar çalıştırmak boşuna iş olurdu.
///   2. Dolu veritabanı -> yalnızca kaydı olmayan migration'lar sırayla
///      çalışır.
///
/// Bu projede migration'ların hepsi tekrar çalıştırılabilir olacak şekilde
/// yazılmış (IF NOT EXISTS, tip kontrolü, DROP-then-ADD, WHERE ile sınırlanmış
/// UPDATE). Bu yüzden 2. durumdaki bir veritabanında takip tablosu henüz yoksa
/// hepsini baştan çalıştırmak güvenli: var olan yapıya dokunmuyorlar.
/// </summary>
public class DatabaseMigrator
{
    /// <summary>
    /// Aynı anda açılan iki örnek aynı migration'ı çalıştırmasın diye alınan
    /// danışma kilidinin (advisory lock) anahtarı. Değer keyfi; tek şartı
    /// uygulama boyunca sabit kalması.
    /// </summary>
    private const long AdvisoryLockKey = 4_812_337_001;

    private const string SchemaResource = "TaskManagementSystem.Database.schema.sql";
    private const string MigrationPrefix = "TaskManagementSystem.Database.migrations.";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly DatabaseOptions _options;
    private readonly ILogger<DatabaseMigrator> _logger;

    public DatabaseMigrator(
        IDbConnectionFactory connectionFactory,
        IOptions<DatabaseOptions> options,
        ILogger<DatabaseMigrator> logger)
    {
        _connectionFactory = connectionFactory;
        _options = options.Value;
        _logger = logger;
    }

    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        if (!_options.AutoMigrate)
        {
            _logger.LogInformation(
                "Database:AutoMigrate kapalı - şema kontrolü atlandı.");
            return;
        }

        using var connection = _connectionFactory.CreateConnection();

        // Bağlantı açık olmalı: kilit bağlantı ömrü boyunca tutuluyor.
        if (connection.State != ConnectionState.Open)
            connection.Open();

        // Kilidi bekleyerek alıyoruz (try_ değil): docker compose'da server
        // birden fazla örnekle ölçeklenirse ikincisi hata vermek yerine
        // birincinin bitmesini beklesin.
        await connection.ExecuteAsync("SELECT pg_advisory_lock(@Key)",
            new { Key = AdvisoryLockKey });

        try
        {
            await EnsureHistoryTableAsync(connection);

            var applied = (await connection.QueryAsync<string>(
                "SELECT file_name FROM schema_migrations")).ToHashSet(
                    StringComparer.Ordinal);

            var migrations = LoadMigrations();

            if (await IsFreshDatabaseAsync(connection))
            {
                await ApplyFreshSchemaAsync(connection, migrations);
                return;
            }

            var pending = migrations.Where(m => !applied.Contains(m.Name)).ToList();

            if (pending.Count == 0)
            {
                _logger.LogInformation(
                    "Şema güncel - {Count} migration daha önce uygulanmış.",
                    applied.Count);
                return;
            }

            _logger.LogInformation(
                "{Count} yeni migration uygulanacak: {Names}",
                pending.Count, string.Join(", ", pending.Select(p => p.Name)));

            foreach (var migration in pending)
                await ApplyAsync(connection, migration);

            _logger.LogInformation("Şema güncellendi.");
        }
        finally
        {
            // Kilit her durumda bırakılmalı; aksi halde bağlantı havuza
            // dönene kadar sonraki açılışlar bekler.
            await connection.ExecuteAsync("SELECT pg_advisory_unlock(@Key)",
                new { Key = AdvisoryLockKey });
        }
    }

    // --- Adımlar ------------------------------------------------------------

    private static async Task EnsureHistoryTableAsync(IDbConnection connection)
    {
        // checksum: dosya sonradan değiştirilmişse fark edilebilsin diye.
        // Uygulanmış bir migration'ı düzenlemek yerine yeni dosya açılmalı.
        const string sql = """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                file_name  VARCHAR(200) PRIMARY KEY,
                checksum   CHAR(64) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """;

        await connection.ExecuteAsync(sql);
    }

    /// <summary>
    /// Veritabanı boş mu? Ölçüt olarak <c>tasks</c> tablosu kullanılıyor:
    /// schema.sql'in kurduğu çekirdek tablolardan biri ve adı hiç değişmedi.
    /// </summary>
    private static async Task<bool> IsFreshDatabaseAsync(IDbConnection connection)
    {
        const string sql = "SELECT to_regclass('public.tasks') IS NULL";

        return await connection.QuerySingleAsync<bool>(sql);
    }

    /// <summary>
    /// Boş veritabanı: schema.sql uygulanıyor, migration'lar çalıştırılmadan
    /// "uygulandı" sayılıyor.
    /// </summary>
    private async Task ApplyFreshSchemaAsync(
        IDbConnection connection,
        IReadOnlyList<Migration> migrations)
    {
        _logger.LogInformation("Veritabanı boş - schema.sql uygulanıyor.");

        var schema = ReadResource(SchemaResource);

        using var transaction = connection.BeginTransaction();

        await connection.ExecuteAsync(schema, transaction: transaction);

        foreach (var migration in migrations)
            await RecordAsync(connection, migration, transaction);

        transaction.Commit();

        _logger.LogInformation(
            "Şema kuruldu; {Count} migration schema.sql'e dahil olduğu için "
            + "uygulanmış sayıldı.",
            migrations.Count);
    }

    private async Task ApplyAsync(IDbConnection connection, Migration migration)
    {
        _logger.LogInformation("Migration uygulanıyor: {Name}", migration.Name);

        // Her migration kendi işleminde: biri patlarsa yarım kalmıyor ve
        // öncekiler geçerli kalıyor. PostgreSQL DDL'i geri alabildiği için
        // bu güvence gerçek (MySQL'de olmazdı).
        using var transaction = connection.BeginTransaction();

        try
        {
            await connection.ExecuteAsync(migration.Sql, transaction: transaction);
            await RecordAsync(connection, migration, transaction);

            transaction.Commit();
        }
        catch (Exception ex)
        {
            transaction.Rollback();

            // Sarmalayıp yeniden fırlatıyoruz: hangi dosyada patladığı
            // yığın izinde kaybolmasın.
            throw new InvalidOperationException(
                $"Migration başarısız: {migration.Name}. Veritabanı bu dosyadan "
                + "önceki haliyle kaldı.", ex);
        }
    }

    private static async Task RecordAsync(
        IDbConnection connection,
        Migration migration,
        IDbTransaction transaction)
    {
        const string sql = """
            INSERT INTO schema_migrations (file_name, checksum)
            VALUES (@Name, @Checksum)
            ON CONFLICT (file_name) DO NOTHING
            """;

        await connection.ExecuteAsync(
            sql,
            new { migration.Name, migration.Checksum },
            transaction);
    }

    // --- Kaynak dosyalar ----------------------------------------------------

    /// <summary>
    /// Migration'lar gömülü kaynak olarak okunuyor, diskten değil: yayınlanmış
    /// uygulamanın ve konteyner imajının yanında ayrıca bir SQL klasörü
    /// taşımak gerekmesin.
    ///
    /// Sıralama ordinal: dosya adları sıfır dolgulu (001, 002 ... 014) olduğu
    /// için alfabetik sıra sayısal sırayla aynı.
    /// </summary>
    private static List<Migration> LoadMigrations()
    {
        var assembly = Assembly.GetExecutingAssembly();

        return assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(MigrationPrefix, StringComparison.Ordinal)
                        && name.EndsWith(".sql", StringComparison.Ordinal))
            .OrderBy(name => name, StringComparer.Ordinal)
            .Select(name =>
            {
                var sql = ReadResource(name);

                return new Migration(
                    Name: name[MigrationPrefix.Length..],
                    Sql: sql,
                    Checksum: Checksum(sql));
            })
            .ToList();
    }

    private static string ReadResource(string resourceName)
    {
        var assembly = Assembly.GetExecutingAssembly();

        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException(
                $"Gömülü kaynak bulunamadı: {resourceName}. csproj içindeki "
                + "EmbeddedResource tanımını kontrol et.");

        using var reader = new StreamReader(stream, Encoding.UTF8);

        return reader.ReadToEnd();
    }

    private static string Checksum(string content)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(content));

        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private sealed record Migration(string Name, string Sql, string Checksum);
}
