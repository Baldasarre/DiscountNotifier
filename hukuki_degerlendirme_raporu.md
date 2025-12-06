# Hukuki Değerlendirme Raporu (Ön İnceleme)

**Proje Adı:** İndirim ve Ürün Toplama Uygulaması (Discount Aggregator App)
**Rapor Tarihi:** 27.11.2025
**Hazırlanma Amacı:** Projenin potansiyel hukuki risklerinin genel prensipler çerçevesinde ön değerlendirmesi.

---

### **YASAL UYARI (DISCLAIMER)**

**Bu belge yasal tavsiye niteliği taşımaz.** Bu rapor, sağlanan bilgilere dayanarak yapay zeka tarafından hazırlanmış bir ön incelemedir ve yalnızca genel bilgilendirme amaçlıdır. Bir avukat-müvekkil ilişkisi oluşturmaz. Projenizin spesifik durumuna ilişkin hukuki risklerin tespiti ve atılacak adımların belirlenmesi için mutlaka teknoloji, fikri mülkiyet ve kişisel verilerin korunması hukuku alanlarında uzman bir hukuk danışmanına başvurulması zorunludur.

---

### 1. Genel Değerlendirme ve Risk Özeti

Proje, popüler bir iş modeli olan fiyat ve ürün toplama (aggregation) üzerine kuruludur. Ancak mevcut işleyişiyle, özellikle veri toplama yöntemi ve toplanan içeriğin kullanımı konularında **YÜKSEK** düzeyde hukuki riskler barındırmaktadır. En kritik riskler **Telif Hakkı İhlali** ve hedef sitelerin **Kullanım Koşullarının İhlali** alanlarında yoğunlaşmaktadır. Kişisel verilerin toplanması nedeniyle KVKK/GDPR uyumluluğu da acil dikkat gerektiren bir diğer önemli alandır.

---

### 2. Veri Toplama (İzinsiz API Kullanımı) Analizi

- **Kullanım Koşullarının İhlali:** Durum "Web Scraping" olmasa bile, temel hukuki risk devam etmektedir. E-ticaret sitelerinin "Kullanım Koşulları" (Terms of Service/ToS), genellikle sadece web scraping'i değil, aynı zamanda kendilerine ait API'lerin izinsiz, belgelenmemiş veya amaç dışı kullanımını da yasaklar. Bir sitenin herkese açık API'sini, o sitenin sunduğu arayüz dışında bir amaç için kullanmak, bu koşulların doğrudan ihlali anlamına gelir.
  - **Risk:** Bu durum, tıpkı web scraping gibi bir sözleşme ihlalidir. Hak sahibi şirketler, API erişiminizi teknik olarak (IP ban, API key iptali) veya yasal olarak (ihtarname, dava) engelleme hakkına sahiptir.
- **Teknik Güvensizlik ve Kırılganlık:** Kullandığınız API'ler, şirketlerin kendi iç kullanımı için tasarlanmıştır ve kamuya açık bir garantileri yoktur. Bu API'ler herhangi bir anda, önceden haber verilmeksizin değiştirilebilir, versiyonları güncellenebilir veya tamamen kapatılabilir. Bu durum, uygulamanızın aniden ve tamamen işlevsiz kalmasına neden olabilir. Bu, yasal bir risk olmaktan çok, iş modelinizin sürdürülebilirliği için ciddi bir teknik risktir.
- **Veritabanı ve İçerik Hakları:** Verinin HTML yerine API üzerinden JSON formatında gelmesi, verinin kendisi üzerindeki (telif hakkı, veritabanı hakkı gibi) fikri mülkiyet korumasını ortadan kaldırmaz. 3. bölümde detaylandırıldığı gibi, API'den gelen ürün fotoğrafları, açıklamaları ve diğer veriler hala telif hakkı koruması altındadır.

**Sonuç:** Hedef sitelerin izni ve resmi bir API sözleşmesi olmadan, onların iç API'lerini kullanmak; hem sözleşmesel bir ihlaldir, hem de teknik olarak son derece kırılgandır ve ciddi bir hukuki risk taşır.

---

### 3. Fikri Mülkiyet Hakları (Telif ve Marka) Analizi

- **Telif Hakkı (Risk: Yüksek):**
  - **Ürün Fotoğrafları:** Ürün fotoğrafları, Fikir ve Sanat Eserleri Kanunu (FSEK) kapsamında "eser" olarak korunmaktadır. Bu fotoğrafları çeken fotoğrafçının veya hak sahibi şirketin izni olmaksızın kopyalamak, kendi sunucunuzda barındırmak ve halka sunmak **doğrudan telif hakkı ihlalidir.**
  - **Ürün Açıklamaları:** Özgün bir şekilde kaleme alınmış ürün açıklamaları da "eser" olarak kabul edilebilir ve aynı şekilde telif hakkı korumasından yararlanır.
  - **Proxy Servisi:** Resimleri bir proxy (`image-proxy.service.js`) üzerinden sunmak, hukuki durumu değiştirmez. Zira eserin "halka arzı" ve "çoğaltılması" eylemleri gerçekleşmeye devam etmektedir. Bu, sorumluluğu ortadan kaldırmaz.

- **Marka Hakkı (Risk: Orta):**
  - **İsim ve Logo Kullanımı:** Marka isimlerini ve logolarını, o markanın ürünlerini belirtmek amacıyla kullanmak ("nominative fair use" / tanımlayıcı adil kullanım) belirli şartlar altında mümkün olabilir. Ancak bu kullanım:
    1.  Sadece bilginin kaynağını belirtmek için gerekli olduğu ölçüde olmalıdır.
    2.  Uygulamanın o markayla ticari bir ilişkisi, sponsorluğu veya onayı olduğu izlenimini **yaratmamalıdır.**
  - **Risk:** Mevcut kullanım (logoların `public/Images` altında saklanması ve arayüzde gösterilmesi), markalar tarafından kendi itibarlarından haksız yararlanıldığı veya marka imajının zedelendiği iddiasıyla dava konusu edilebilir. Bir feragatname (`disclaimer`) eklemek riski azaltabilir ancak tamamen ortadan kaldırmaz.

---

### 4. Kişisel Verilerin Korunması (KVKK/GDPR) Analizi

- **Veri Sorumlusu Sıfatı:** Kullanıcılardan e-posta ve şifre gibi kişisel verileri aldığınız anda, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve/veya GDPR kapsamında **"Veri Sorumlusu"** sıfatını kazanırsınız. Bu, size bir dizi yasal yükümlülük getirir.
- **Acil Yükümlülükler:**
  1.  **Aydınlatma Metni:** Kullanıcılara, hangi kişisel verilerini ne amaçla, hangi hukuki sebebe dayanarak işlediğinizi, kimlere aktarabileceğinizi ve haklarının neler olduğunu açıklayan bir Aydınlatma Metni sunmak **zorunludur.**
  2.  **Gizlilik Politikası:** Aydınlatma Metni ile birlikte, kullanıcı verilerinin nasıl işlendiğine dair daha genel bir çerçeve sunan bir Gizlilik Politikası yayınlamalısınız.
  3.  **Açık Rıza:** Eğer verileri, kullanıcının temel hizmeti alması (örneğin, uygulamaya giriş yapması) dışındaki amaçlar için (örn: pazarlama e-postaları göndermek, davranışsal analiz yapmak) kullanacaksanız, bu amaçlar için ayrı ayrı **"Açık Rıza"** almanız gerekir.
  4.  **Veri Güvenliği:** Topladığınız verilerin güvenliğini sağlamak için gerekli teknik (örn: şifrelerin hash'lenerek saklanması, SSL kullanımı) ve idari (örn: verilere erişim yetkilerinin sınırlandırılması) tedbirleri almakla yükümlüsünüz.
  5.  **VERBİS Kaydı:** Yıllık çalışan sayısı ve mali bilanço gibi kriterlere bağlı olarak, Veri Sorumluları Sicil Bilgi Sistemi'ne (VERBİS) kayıt olmanız gerekebilir.

---

### 5. Rekabet Hukuku ve Haksız Rekabet Analizi

- Fiyat karşılaştırma siteleri yasal bir zeminde faaliyet gösterebilir. Ancak, sizin durumunuzdaki gibi verileri elde etme yöntemi (Kullanım Koşullarını ihlal eden scraping) ve elde edilen içeriğin kullanımı (telifli materyallerin izinsiz gösterimi), Türk Ticaret Kanunu kapsamında **"haksız rekabet"** teşkil edebilir. Rakipleriniz, "başkalarının emeğinden ve iş ürünlerinden haklı bir sebep olmaksızın yararlanma" iddiasıyla size karşı hukuki yollara başvurabilir.

---

### 6. Risk Azaltma Stratejileri ve Acil Eylem Planı

1.  **En Radikal ve Güvenli Yol - İş Modelini Değiştirmek:**
    - **Affiliate (Satış Ortaklığı) Anlaşmaları:** Markalarla veya e-ticaret platformlarıyla (örn: Trendyol, Amazon vb.) satış ortaklığı anlaşmaları yapın. Bu anlaşmalar kapsamında size ürün verilerini ve resimlerini kullanmanız için bir lisans ve genellikle bir API erişimi sağlanır. Gelir modeliniz de bu ortaklık üzerinden komisyon kazanmaya dönüşür. **Bu, en sürdürülelebilir ve yasal olarak en güvenli yoldur.**

2.  **Mevcut Modelde Risk Azaltma (Daha Az Güvenli):**
    - **Telifli İçerikleri Derhal Kaldırın:** Ürün fotoğraflarını ve özgün açıklamaları kendi sunucunuzda barındırmayı ve sergilemeyi hemen durdurun.
    - **Sadece Veri Gösterimi ve Link Verme:** Sadece telif koruması olmayan veya zayıf olan verileri (ürün adı, marka, fiyat) gösterin ve ürünün detayları ve resmi için **doğrudan orijinal web sitesine link verin.** Bu, "crawler" veya "indexer" (Google gibi) işlevine yaklaşır ve riski önemli ölçüde azaltır.
    - **KVKK/GDPR Uyumluluğunu Sağlayın:** Acilen bir avukattan destek alarak Aydınlatma Metni, Gizlilik Politikası ve (gerekliyse) Açık Rıza mekanizmalarını hazırlayıp uygulamaya koyun.
    - **Feragatname Ekleyin:** Sitenizin görünür bir yerine, adı geçen markalarla hiçbir resmi bağınızın olmadığını, bilgilerin sadece bilgilendirme amaçlı olduğunu belirten net bir feragatname ekleyin.

**Sonuç:** Projenin mevcut haliyle devam etmesi, yüksek bir finansal ve yasal risk taşımaktadır. En kısa sürede bir hukuk danışmanıyla görüşerek projenin geleceği için stratejik bir karar vermeniz şiddetle tavsiye edilir.