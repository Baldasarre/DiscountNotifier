const cron = require("node-cron");
const StradivariusService = require("./stradivarius.service");
const config = require("../config/environment");

const zaraService = require("./zara.service");
const bershkaService = require("./bershka.service");

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
    this.isDevelopment = config.NODE_ENV === "development";
    this.dataFetchEnabled = true;
  }

  async initialize() {
    if (this.isInitialized) {
      console.log("⚠️  Scheduler zaten başlatılmış");
      return;
    }

    console.log("🚀 Scheduler başlatılıyor...");

    if (this.dataFetchEnabled) {
      await this.runInitialDataFetch();
    } else {
      console.log("🔌 Veri çekme anahtarı kapalı - ilk çekme atlanıyor");
    }

    this.startPeriodicTasks();

    this.isInitialized = true;
    console.log("✅ Scheduler başarıyla başlatıldı");
  }

  async runInitialDataFetch() {
    console.log("📡 İlk veri çekme işlemi başlatılıyor...");

    try {
      if (this.isDevelopment && !config.FORCE_INITIAL_FETCH) {
        console.log("🟨 Development modunda Zara otomatik çekme devre dışı");
        console.log(
          "💡 Manuel Zara fetch için environment değişkeni: FORCE_INITIAL_FETCH=true"
        );
      } else {
        console.log("🟨 Zara ürünleri çekiliyor...");
        console.log("⚠️ Zara scraping henüz scheduler'a entegre edilmedi");
      }

      if (this.isDevelopment && !config.FORCE_STRADIVARIUS_INITIAL_FETCH) {
        console.log(
          "🟪 Development modunda Stradivarius otomatik çekme devre dışı"
        );
        console.log(
          "💡 Manuel Stradivarius fetch için environment değişkeni: FORCE_STRADIVARIUS_INITIAL_FETCH=true"
        );
      } else {
        console.log("🟪 Stradivarius ürünleri çekiliyor...");
        const stradivariusInstance = new StradivariusService();
        await stradivariusInstance.scrapeAll();
        console.log("✅ Stradivarius veri çekme işlemi tamamlandı");
      }

      if (config.FORCE_BERSHKA_CATEGORY_FETCH) {
        console.log("🟩 Bershka kategorileri çekiliyor...");
        const BershkaService = require("./bershka.service");
        const bershkaInstance = new BershkaService();

        try {
          if (config.ENABLE_BERSHKA_CURL_FETCH) {
            console.log(
              "🔄 CURL ile fresh data çekiliyor ve kategoriler işleniyor..."
            );
            await bershkaInstance.fetchFreshDataWithCurl();
          } else {
            console.log("📁 Mevcut test data kullanılıyor...");
            await bershkaInstance.fetchCategoriesFromTestData();
          }
        } catch (curlError) {
          console.log("⚠️ CURL başarısız, mevcut data kullanılıyor...");
          await bershkaInstance.fetchCategoriesFromTestData();
        }

        console.log("✅ Bershka kategori çekme işlemi tamamlandı");
      } else {
        console.log("🟩 Development modunda Bershka kategori çekme devre dışı");
        console.log(
          "💡 Manuel Bershka kategori fetch için environment değişkeni: FORCE_BERSHKA_CATEGORY_FETCH=true"
        );
        console.log(
          "💡 CURL ile fresh data için: ENABLE_BERSHKA_CURL_FETCH=true"
        );
      }

      if (this.isDevelopment && !config.FORCE_BERSHKA_INITIAL_FETCH) {
        console.log("🟩 Development modunda Bershka otomatik çekme devre dışı");
        console.log(
          "💡 Manuel Bershka fetch için environment değişkeni: FORCE_BERSHKA_INITIAL_FETCH=true"
        );
      } else {
        console.log("🟩 Bershka ürünleri çekiliyor...");
        const BershkaService = require("./bershka.service");
        const bershkaInstance = new BershkaService();
        await bershkaInstance.fetchAllCategoriesProducts();
        console.log("✅ Bershka veri çekme işlemi tamamlandı");
      }
    } catch (error) {
      console.error("❌ İlk veri çekme işleminde hata:", error);
    }
  }

  startPeriodicTasks() {
    if (this.isDevelopment && !config.ENABLE_PERIODIC_TASKS) {
      console.log("⏰ Development modunda periyodik görevler devre dışı");
      console.log("💡 Aktif etmek için: ENABLE_PERIODIC_TASKS=true");
      return;
    }

    const dataFetchJob = cron.schedule(
      "0 */6 * * *",
      async () => {
        if (this.dataFetchEnabled) {
          console.log("🔄 Periyodik veri çekme başlatılıyor...");
          await this.runInitialDataFetch();
        } else {
          console.log(
            "🔌 Veri çekme anahtarı kapalı - periyodik çekme atlanıyor"
          );
        }
      },
      {
        scheduled: false,
        timezone: "Europe/Istanbul",
      }
    );

    this.jobs.set("dataFetch", dataFetchJob);
    dataFetchJob.start();

    console.log("⏰ Periyodik görevler başlatıldı:");
    console.log("   - Veri çekme: Her 6 saatte bir");
    console.log(
      `   - Anahtar durumu: ${this.dataFetchEnabled ? "AÇIK" : "KAPALI"}`
    );
  }

  toggleDataFetch() {
    this.dataFetchEnabled = !this.dataFetchEnabled;
    const status = this.dataFetchEnabled ? "AÇIK" : "KAPALI";
    console.log(`�� Veri çekme anahtarı ${status} yapıldı`);
    return this.dataFetchEnabled;
  }

  enableDataFetch() {
    this.dataFetchEnabled = true;
    console.log("🔌 Veri çekme anahtarı AÇIK yapıldı");
    return true;
  }

  disableDataFetch() {
    this.dataFetchEnabled = false;
    console.log("🔌 Veri çekme anahtarı KAPALI yapıldı");
    return false;
  }

  getDataFetchStatus() {
    return {
      enabled: this.dataFetchEnabled,
      status: this.dataFetchEnabled ? "AÇIK" : "KAPALI",
    };
  }

  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      console.log(`⏹️  ${jobName} görevi durduruldu`);
    }
  }

  startJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      console.log(`▶️  ${jobName} görevi başlatıldı`);
    }
  }

  stopAll() {
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️  ${name} görevi durduruldu`);
    });

    this.isInitialized = false;
    console.log("🛑 Tüm scheduled görevler durduruldu");
  }

  async performDataUpdate() {
    if (!this.dataFetchEnabled) {
      console.log("🔌 Veri çekme anahtarı kapalı - güncelleme atlanıyor");
      return false;
    }

    try {
      console.log("🔍 Yeni ürün kontrolü başlatılıyor...");

      const hasNewProducts = await zaraService.checkForNewProducts();

      if (hasNewProducts) {
        console.log(
          "🆕 Yeni ürünler tespit edildi - tam güncelleme yapılıyor..."
        );
        await zaraService.fetchAndSaveAllProducts();
        return true;
      } else {
        console.log("✅ Yeni ürün yok - mevcut verilerle devam ediliyor");
        return false;
      }
    } catch (error) {
      console.error("❌ Veri güncelleme hatası:", error);
      return false;
    }
  }

  async triggerManualUpdate(brand = "zara", forceFullUpdate = false) {
    console.log(`🔄 Manuel ${brand} güncellemesi başlatılıyor...`);

    try {
      if (brand === "zara") {
        if (forceFullUpdate) {
          console.log("🔄 Zorla tam güncelleme yapılıyor...");
          await zaraService.fetchAndSaveAllProducts(true);
        } else {
          console.log("🔍 Manuel performans odaklı güncelleme başlatılıyor...");
          await this.performDataUpdate();
        }
        console.log("✅ Manuel Zara güncellemesi tamamlandı");
        return true;
      } else {
        console.log(`❌ ${brand} markası henüz desteklenmiyor`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Manuel ${brand} güncellemesinde hata:`, error);
      return false;
    }
  }

  getStatus() {
    const status = {
      isInitialized: this.isInitialized,
      dataFetchEnabled: this.dataFetchEnabled,
      dataFetchStatus: this.dataFetchEnabled ? "AÇIK" : "KAPALI",
      activeJobs: [],
      totalJobs: this.jobs.size,
    };

    this.jobs.forEach((job, name) => {
      status.activeJobs.push({
        name,
        running: job.running || false,
      });
    });

    return status;
  }
}

module.exports = new SchedulerService();
