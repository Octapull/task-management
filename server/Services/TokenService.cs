using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using TaskManagementSystem.Entities;

namespace TaskManagementSystem.Services;

public class TokenService : ITokenService
{
    private readonly IConfiguration _configuration;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateToken(User user, Team? team = null)
    {
        var jwtSettings = _configuration.GetSection("Jwt");
        // Uygulama açılırken AddJwtAuthentication zaten doğruluyor; buradaki
        // kontrol yalnızca son çare.
        var key = jwtSettings["Key"]
            ?? throw new InvalidOperationException("Jwt:Key tanımlı değil (User Secrets).");

        // Token'ın içine gömülecek bilgiler (payload). Bunlar şifreli değil,
        // sadece imzalı - yani okunabilir ama değiştirilemez.
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.Role.ToString())
        };

        // Ekip Id'si token'da taşınıyor: her istekte "bu kullanıcı hangi
        // ekipte" diye veritabanına sormak gerekmiyor. Ekip değişimi diye bir
        // akış yok, bilgi token ömrü boyunca geçerli kalıyor.
        var teamId = team?.Id ?? user.TeamId;

        if (teamId is > 0)
            claims.Add(new Claim(AppClaimTypes.TeamId, teamId.Value.ToString()));

        if (!string.IsNullOrEmpty(team?.Name))
            claims.Add(new Claim(AppClaimTypes.TeamName, team.Name));

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var expiryMinutes = double.Parse(jwtSettings["ExpiryMinutes"] ?? "60");

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiryMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
