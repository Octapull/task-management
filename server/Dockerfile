# syntax=docker/dockerfile:1

# ---- Derleme ----------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Önce yalnızca csproj kopyalanıyor: paket listesi değişmediği sürece restore
# katmanı önbellekten geliyor, her kod değişikliğinde paketler yeniden
# indirilmiyor.
COPY TaskManagementSystem.csproj ./
RUN dotnet restore TaskManagementSystem.csproj

COPY . ./
RUN dotnet publish TaskManagementSystem.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish

# ---- Çalıştırma -------------------------------------------------------------
# SDK değil runtime imajı: derleyici ve NuGet önbelleği son imaja girmiyor.
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# compose'daki healthcheck curl'e ihtiyaç duyuyor; runtime imajı çıplak geliyor.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish ./

# Ek dosyalar named volume'a bağlanıyor. Klasör imajda app kullanıcısına ait
# olarak zaten var olduğu için Docker, volume'u ilk oluştururken bu sahipliği
# kopyalıyor. Klasör imajda olmasaydı volume root'a ait olurdu ve root
# olmayan kullanıcıyla çalışan uygulama içine yazamazdı.
RUN mkdir -p /app/attachments && chown -R $APP_UID:$APP_UID /app/attachments

ENV ASPNETCORE_URLS=http://+:8080 \
    Storage__AttachmentsPath=/app/attachments

EXPOSE 8080

# Root olarak çalıştırma: konteyner ele geçirilirse yetki kazanımı zorlaşsın.
USER $APP_UID

ENTRYPOINT ["dotnet", "TaskManagementSystem.dll"]
