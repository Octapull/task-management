namespace TaskManagementSystem.Entities;

// Sınıfın adı bilerek "TaskItem" - "Task" ismi C#'ta System.Threading.Tasks.Task
// ile çakışıyor (async metodların dönüş tipi), karışıklık olmasın diye.
public class TaskItem
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public TaskItemStatus Status { get; set; } = TaskItemStatus.Open;
    public TaskPriority Priority { get; set; } = TaskPriority.Medium;
    public DateTime? DueDate { get; set; }

    // İş boştayken null, biri aldığında o kullanıcının Id'si atanır.
    public int? AssignedUserId { get; set; }

    // İşi oluşturan kullanıcı. Bu sütun sonradan eklendiği için eski
    // kayıtlarda null olabilir.
    public int? CreatedByUserId { get; set; }

    // İşin ait olduğu ekip. Sorgular bu sütuna göre filtreleniyor; istemci
    // hiçbir zaman bu değeri göndermiyor, token'dan okunuyor.
    public int? TeamId { get; set; }

    public DateTime CreatedAt { get; set; }

    // İş "Boşta"dan çıktığı an. Havuza geri döndüğünde tekrar null olur;
    // tamamlandığında ise korunur - "ne zaman başlandı" bilgisi orada lazım.
    public DateTime? StartedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    // Kontrol listesi sayaçları. Tabloda tutulmuyor, iş sorgusunda hesaplanıyor:
    // kartta "3/5" rozetini göstermek için her kart açılışında ayrı istek
    // atmak gerekmesin.
    public int ChecklistTotal { get; set; }
    public int ChecklistDone { get; set; }

    // İşe takılı etiketlerin id'leri. Etiketin adı ve rengi burada değil:
    // istemci etiket listesini bir kez çekip id üzerinden eşliyor, böylece
    // her işte aynı metin tekrar tekrar taşınmıyor.
    public int[] LabelIds { get; set; } = [];
}