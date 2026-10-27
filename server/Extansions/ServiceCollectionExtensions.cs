using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using TaskManagementSystem.Data;
using TaskManagementSystem.Services;

namespace TaskManagementSystem.Extensions;

public static class ServiceCollectionExtensions
{
    /// <summary>Angular istemcisi için CORS politikasının adı.</summary>
    public const string CorsPolicyName = "AngularClient";

    /// <summary>Kimlik doğrulama uçlarına uygulanan hız sınırı politikası.</summary>
    public const string AuthRateLimitPolicy = "auth";

    // Program.cs'e her yeni servis eklendiğinde satır satır büyümesin diye
    // ilgili kayıtları burada topluyoruz.
    public static IServiceCollection AddDataAccess(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddScoped<IDbConnectionFactory, NpgsqlConnectionFactory>();
        services.AddScoped<IActivityLogService, ActivityLogService>();

        // Şema kurulumu ve migration'lar. Açılışta bir kez çalışıyor
        // (bkz. Program.cs), bu yüzden scoped: kendi kapsamından çözülüyor.
        services.Configure<DatabaseOptions>(
            configuration.GetSection(DatabaseOptions.SectionName));
        services.AddScoped<DatabaseMigrator>();

        return services;
    }

    /// <summary>
    /// E-posta gönderimi ve doğrulama kodu üretimi.
    ///
    /// Hangi e-posta implementasyonunun kullanılacağı appsettings >
    /// Email:Provider ile seçiliyor: "Resend" HTTPS API ile gönderir, "Smtp"
    /// SMTP ile gönderir, diğer her değer (varsayılan "Mock") kodu yalnızca
    /// loga yazar.
    /// </summary>
    public static IServiceCollection AddEmailVerification(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.SectionName));

        var options = configuration
            .GetSection(EmailOptions.SectionName)
            .Get<EmailOptions>() ?? new EmailOptions();

        if (options.UsesResend)
        {
            services.AddHttpClient(ResendEmailService.HttpClientName, client =>
            {
                // Sondaki eğik çizgi şart: BaseAddress'in son parçası aksi
                // halde göreli adresle değiştiriliyor ve "emails" isteği
                // kök adrese gidiyor.
                client.BaseAddress = new Uri(options.Resend.BaseUrl.TrimEnd('/') + "/");
                client.Timeout = TimeSpan.FromSeconds(options.Resend.TimeoutSeconds);
            });

            services.AddScoped<IEmailService, ResendEmailService>();

            // Anahtar olmadan tek bir posta bile gitmez; bunu ilk kayıt
            // denemesinde değil açılışta öğrenmek daha iyi.
            if (string.IsNullOrWhiteSpace(options.Resend.ApiKey))
            {
                Console.WriteLine(
                    "UYARI: Email:Provider 'Resend' ama Email:Resend:ApiKey boş - " +
                    "posta GÖNDERİLMEYECEK. Email__Resend__ApiKey değişkenini tanımla.");
            }
        }
        else if (options.UsesSmtp)
        {
            services.AddScoped<IEmailService, SmtpEmailService>();
        }
        else
        {
            services.AddScoped<IEmailService, LoggingEmailService>();

            // Development dışında mock posta neredeyse her zaman bir
            // yapılandırma kazasıdır: kullanıcı doğrulama kodunu hiç almaz.
            // Sessizce çalışmasındansa açılışta uyarsın.
            if (!environment.IsDevelopment())
            {
                Console.WriteLine(
                    "UYARI: Email:Provider 'Mock' - posta GÖNDERİLMEYECEK. " +
                    "Gerçek gönderim için Email__Provider=Resend ve " +
                    "Email__Resend__ApiKey değişkenlerini tanımla.");
            }
        }

        services.AddScoped<IVerificationCodeService, VerificationCodeService>();

        // Bildirim postaları arka planda gönderiliyor; kuyruk singleton
        // çünkü hem istek kapsamından yazılıyor hem de arka plan servisi
        // aynı örnekten okuyor.
        services.AddSingleton<EmailQueue>();
        services.AddSingleton<IEmailQueue>(sp => sp.GetRequiredService<EmailQueue>());
        services.AddHostedService<EmailBackgroundSender>();
        services.AddHostedService<DueDateReminderService>();

        services.AddScoped<ITaskNotificationService, TaskNotificationService>();

        return services;
    }

    /// <summary>Dosya eklerinin diskte saklanması.</summary>
    public static IServiceCollection AddAttachmentStorage(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<StorageOptions>(
            configuration.GetSection(StorageOptions.SectionName));

        // Singleton: kök klasörü bir kez çözüp oluşturuyor, durum tutmuyor.
        services.AddSingleton<IAttachmentStorage, AttachmentStorage>();

        return services;
    }

    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ITokenService, TokenService>();

        // Yenileme token'ları: erişim token'ı kısa ömürlü kalabilsin diye.
        services.AddScoped<IRefreshTokenService, RefreshTokenService>();

        var jwtSettings = configuration.GetSection("Jwt");
        var key = jwtSettings["Key"];

        // Anahtar sızarsa herkes kendine geçerli token üretebilir, bu yüzden
        // appsettings.json'da bilerek boş duruyor ve User Secrets'tan geliyor.
        if (string.IsNullOrWhiteSpace(key))
        {
            throw new InvalidOperationException(
                """
                Jwt:Key boş.

                Kurulum (server klasöründe):
                  dotnet user-secrets set "Jwt:Key" "<openssl rand -base64 32 çıktısı>"
                """);
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwtSettings["Issuer"],
                    ValidAudience = jwtSettings["Audience"],
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key))
                };

                // SignalR, tarayıcıdan WebSocket bağlantısı kurarken normal
                // Authorization header'ını kullanamıyor. Bu yüzden token'ı
                // bağlantı adresine eklenen ?access_token=... parametresinden
                // okuyoruz - ama SADECE /hubs ile başlayan adreslerde.
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;

                        if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
                        }

                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();

        return services;
    }

    /// <summary>
    /// Kimlik doğrulama uçlarına hız sınırı.
    ///
    /// Sınır yalnızca AuthController'a uygulanıyor: pano ve SignalR trafiği
    /// normal kullanımda çok daha yoğun, onları aynı kovaya koymak gerçek
    /// kullanıcıyı engellerdi.
    ///
    /// Bölümleme IP bazlı. Aynı ofisten çıkan birden fazla kullanıcı aynı
    /// kovayı paylaşıyor; dakikada 10 istek, giriş/kayıt/kod doğrulama için
    /// fazlasıyla yeterli ama otomatik şifre denemesini işe yaramaz kılıyor.
    /// </summary>
    public static IServiceCollection AddAuthRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(options =>
        {
            options.AddPolicy(AuthRateLimitPolicy, httpContext =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // IP okunamıyorsa hepsi tek kovaya düşsün: kimliği
                    // belirsiz trafiğe sınırsız hak vermektense paylaştırmak
                    // daha güvenli.
                    partitionKey: httpContext.Connection.RemoteIpAddress?.ToString()
                        ?? "bilinmeyen",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 10,
                        Window = TimeSpan.FromMinutes(1),
                    }));

            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Varsayılan yanıt gövdesiz geliyor; istemci ne olduğunu
            // anlayabilsin diye açıklama ve bekleme süresi ekliyoruz.
            options.OnRejected = async (context, cancellationToken) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter =
                        ((int)retryAfter.TotalSeconds).ToString();
                }

                context.HttpContext.Response.ContentType = "text/plain; charset=utf-8";

                await context.HttpContext.Response.WriteAsync(
                    "Çok fazla deneme yaptın. Lütfen bir dakika sonra tekrar dene.",
                    cancellationToken);
            };
        });

        return services;
    }

    public static IServiceCollection AddRealtime(this IServiceCollection services)
    {
        services.AddSignalR();

        return services;
    }

    /// <summary>
    /// Angular ayrı bir adreste (ör. http://localhost:4200) çalıştığı için
    /// tarayıcı, izin verilmedikçe API'ye istek atmayı engelliyor.
    ///
    /// İzin verilen adresler appsettings.json > Cors:AllowedOrigins altında.
    /// Yıldız (*) kullanmıyoruz: SignalR bağlantısı kimlik bilgisi taşıdığı
    /// için AllowCredentials gerekiyor ve bu ikisi birlikte kullanılamıyor.
    /// </summary>
    public static IServiceCollection AddCorsPolicy(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var allowedOrigins = configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? [];

        services.AddCors(options =>
        {
            options.AddPolicy(CorsPolicyName, policy =>
            {
                policy
                    .WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        return services;
    }
}