
  ### **Hukuki Riski Minimize Etme Eylem Planı**

#### **Aşama 1: Acil Risk Azaltma (Hemen Yapılacaklar)**

Bu adımlar, şu anki en bariz ve kanıtlanması en kolay ihlalleri durdurarak sizi potansiyel bir ihtarname veya davaya karşı korumayı amaçlar.

1.  **Telifli İçeriği Kaldırma:**
    *   **Görev:** Başka sitelerden çekilen **tüm ürün görsellerini ve ürün açıklamalarını** sitenizden tamamen kaldırın. `image-proxy.service.js` kullanımını durdurun ve veritabanınızdaki bu verileri gösteren kodları devre dışı bırakın.
    *   **Neden?** Bu, telif hakkı ihlalinin en net ve en riskli kısmıdır. Bu adımı atmak, risk profilinizi anında %50'den fazla azaltır.

2.  **Feragatname (Disclaimer) Ekleme:**
    *   **Görev:** Sitenizin her sayfasının altında (footer kısmında) ve "Hakkında" gibi bir sayfada net bir şekilde görülecek şekilde aşağıdaki gibi bir feragatname ekleyin:
        > *"Bu site, markaların resmi bir ortağı veya satıcısı değildir. Görüntülenen marka isimleri ve logoları, ilgili marka sahiplerine aittir ve sadece bilgi verme amacıyla kullanılmaktadır. Sitemiz, halka açık kaynaklardan toplanan bilgileri sunan bağımsız bir karşılaştırma platformudur."*
    *   **Neden?** Bu, marka hakkı ihlali ve haksız rekabet iddialarına karşı "iyi niyetinizi" gösteren ve markalarla bir ilişkiniz olduğu yönündeki olası bir karışıklığı önlemeye yardımcı olan önemli bir adımdır. Tek başına bir savunma olmasa da, riskinizi azaltır.

3.  **Temel KVKK Uyumluluğu:**
    *   **Görev:** Bir "Gizlilik Politikası" ve "Aydınlatma Metni" oluşturup sitenize ekleyin. Bu metinlerde kullanıcılarınızdan hangi verileri (e-posta vb.) topladığınızı, ne amaçla kullandığınızı ve nasıl koruduğunuzu açıklayın.
    *   **Neden?** Bu, veri toplayan her site için yasal bir zorunluluktur. Eksikliği, idari para cezalarına yol açabilir.

---

#### **Aşama 2: Stratejik Yön Değişikliği (Orta Vadeli Plan)**

Acil adımları attıktan sonra projenin geleceği için bir yol seçmeniz gerekiyor. İşte iki temel sürdürülebilir model:

**Öneri A: Satış Ortaklığı (Affiliate) Modeli (En Güvenli Yol)**

Bu modelde, markalarla veya aracı platformlarla anlaşarak onların verilerini yasal olarak kullanırsınız.

*   **Plan Adımları:**
    1.  **Araştırma:** Türkiye'de hizmet veren `Trendyol`, `Hepsiburada` gibi pazar yerlerinin veya `Awin`, `Gelir Ortakları` gibi affiliate ağlarının programlarını araştırın. Hedeflediğiniz markaların kendi satış ortaklığı programları olup olmadığını kontrol edin.
    2.  **Başvuru:** Bu programlara başvurun. Başvurunuzda sitenizin ne yaptığını ve onlara nasıl trafik yönlendireceğinizi açıklayın.
    3.  **API Entegrasyonu:** Kabul edildiğinizde, size ürün verilerini (görsel, açıklama, fiyat ve size özel linkler) çekebileceğiniz resmi bir API erişimi verilecektir.
    4.  **Servisleri Yeniden Yazma:** Mevcut izinsiz API kullanan servislerinizi (`zara.service.js` vb.), bu resmi API'leri kullanacak şekilde yeniden yazın.
    5.  **Gelir Modeli:** Bu modelle, siteniz üzerinden giden ve satışla sonuçlanan her trafik için komisyon kazanarak yasal bir gelir modeli de oluşturmuş olursunuz.

**Öneri B: "Link Veren" Agregatör Modeli (Daha Az Riskli Yol)**

Bu model, Google gibi bir arama motoruna daha çok benzer. Telifli içeriği göstermeden sadece bilgi verip orijinal kaynağa yönlendirir.

*   **Plan Adımları:**
    1.  **Veri Çekme Mantığını Değiştirme:** Servislerinizi, hedef sitelerden **sadece** şu verileri çekecek şekilde güncelleyin:
        *   Ürün Adı
        *   Fiyat
        *   Marka
        *   Ürünün Orijinal Linki
    2.  **Veritabanı ve Arayüzü Güncelleme:**
        *   Veritabanınızdan ürün açıklaması ve resim URL'si gibi kolonları kaldırın.
        *   Kullanıcı arayüzünü (örn: `user-dashboard`), ürünleri sadece bir liste halinde (ürün adı, fiyatı ve markasıyla) gösterecek şekilde yeniden tasarlayın. **Görsel göstermeyin.**
        *   Her ürün listelemesinin yanında, kullanıcıyı doğrudan ürünün orijinal sayfasına (Zara, Oysho vb.) gönderecek bir "Siteye Git" butonu veya linki koyun.
    3.  **Sonuç:** Bu modelde telif hakkı riski neredeyse sıfırlanır, çünkü başkasının eserini kopyalayıp yayınlamıyorsunuz; sadece ona link veriyorsunuz. Markaların Kullanım Koşulları'nı ihlal etme riski devam etse de, onlara ücretsiz trafik gönderdiğiniz için size karşı harekete geçme ihtimalleri çok daha düşüktür.

---

#### **Aşama 3: Tam Uyumluluk ve İyileştirme (Uzun Vadeli Plan)**

Stratejik yönünüzü seçtikten sonra:

1.  **Detaylı KVKK Analizi:** Bir uzmandan destek alarak Çerez Politikası, çerez onayı mekanizması (cookie consent banner), kullanıcıların verilerini silme talebi gibi ileri seviye KVKK/GDPR gerekliliklerini eksiksiz olarak uygulayın.
2.  **Teknik İyileştirmeler:** Seçtiğiniz modele göre (API veya link verme) hata yönetiminizi (örneğin bir linkin kırılması) ve sistem performansınızı iyileştirin.
3.  **Hukuki Gözden Geçirme:** Yeni iş modelinizi bir hukuk danışmanına sunarak son bir kontrol yaptırın.

**Özetle:** Size önerim, **Aşama 1'i derhal uygulamanız**, ardından uzun vadeli ve kârlı bir gelecek için **Aşama 2 - Öneri A (Satış Ortaklığı)** üzerinde yoğunlaşmanızdır. Eğer bu mümkün olmazsa, **Öneri B (Link Veren Model)** sizi büyük risklerden koruyacak en iyi alternatiftir.