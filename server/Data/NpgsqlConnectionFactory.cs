using System.Data;
using Npgsql;

namespace TaskManagementSystem.Data;

public class NpgsqlConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public NpgsqlConnectionFactory(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");

        // appsettings.json git'te takipli olduğu için bağlantı bilgisi orada
        // bilerek boş; gerçek değer User Secrets'tan ya da ortam
        // değişkeninden geliyor. Boşsa sessizce bağlanmaya çalışmak yerine
        // ne yapılması gerektiğini söyleyerek duruyoruz.
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                """
                ConnectionStrings:DefaultConnection boş.

                Kurulum (server klasöründe):
                  dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=taskmanagementsystem;Username=postgres;Password=SIFRE"
                """);
        }

        _connectionString = connectionString;
    }

    public IDbConnection CreateConnection()
    {
        return new NpgsqlConnection(_connectionString);
    }
}
