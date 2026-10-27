using System.Data;

namespace TaskManagementSystem.Data;

// Dapper, Entity Framework gibi otomatik bir DbContext sağlamaz.
// Bu yüzden nerede bir veritabanı bağlantısına ihtiyacımız olursa
// bu arayüz üzerinden yeni bir bağlantı (IDbConnection) alıyoruz.
public interface IDbConnectionFactory
{
    IDbConnection CreateConnection();
}