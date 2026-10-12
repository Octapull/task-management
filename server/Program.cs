using TaskManagementSystem.Data;
using TaskManagementSystem.Extensions;
using TaskManagementSystem.Hubs;
using TaskManagementSystem.Middleware;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

// Yakalanmamış istisnalar ham hata yerine ProblemDetails olarak dönsün.
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.ParameterLocation.Header,
        Description = "Token'ı 'Bearer {token}' formatında değil, SADECE token'ın kendisini yapıştır."
    });

    options.AddSecurityRequirement(document => new Microsoft.OpenApi.OpenApiSecurityRequirement
    {
        [new Microsoft.OpenApi.OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});
builder.Services.AddDataAccess(builder.Configuration);
builder.Services.AddEmailVerification(builder.Configuration, builder.Environment);
builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddAttachmentStorage(builder.Configuration);
builder.Services.AddAuthRateLimiting();
builder.Services.AddRealtime();
builder.Services.AddCorsPolicy(builder.Configuration);

// Konteyner ortamı "ayakta mı" diye buraya bakıyor (docker compose
// healthcheck). Sağlıklı sayılmadan client konteyneri başlatılmıyor.
builder.Services.AddHealthChecks();

var app = builder.Build();

// Şema kontrolü isteklerden ÖNCE: ilk istek eksik bir tabloya çarpmasın.
// Migration patlarsa uygulama hiç açılmıyor - yarım şemayla çalışıp
// anlaşılmaz hatalar üretmesindense burada durması daha iyi.
using (var scope = app.Services.CreateScope())
{
    var migrator = scope.ServiceProvider.GetRequiredService<DatabaseMigrator>();
    await migrator.RunAsync();
}

// Configure the HTTP request pipeline.

// En başta: altındaki her katmanda oluşan istisnayı yakalayabilmesi için.
app.UseExceptionHandler();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Geliştirmede http profiliyle çalışıldığında yönlendirilecek bir https
// portu olmuyor ve her açılışta uyarı basıyor; Angular proxy'si de zaten
// http üzerinden konuşuyor. Bu yüzden yalnızca gerçek ortamlarda açık.
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseStaticFiles();

// Sıra önemli: CORS, kimlik doğrulamadan önce çalışmalı - aksi halde
// tarayıcının ön kontrol (preflight) isteği 401 alıp reddedilir.
app.UseCors(ServiceCollectionExtensions.CorsPolicyName);

// Hız sınırı kimlik doğrulamadan önce: geçersiz token'la yapılan yoğun
// deneme de sayaca girsin.
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");
app.MapHub<TaskHub>("/hubs/tasks");

app.Run();
