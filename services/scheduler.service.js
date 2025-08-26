const cron = require("node-cron");
const zaraService = require("./zara.service");
const config = require("../config/environment");

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
    this.isDevelopment = config.NODE_ENV === "development";
    this.dataFetchEnabled = false;
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
    if (this.isDevelopment && !config.FORCE_INITIAL_FETCH) {
      console.log("🔄 Development modunda otomatik veri çekme devre dışı");
      console.log("💡 Manuel fetch için: POST /api/products/refresh");
      return;
    }

    console.log("📡 İlk veri çekme işlemi başlatılıyor...");

    try {
      await zaraService.fetchAndSaveAllProducts();
      console.log("✅ İlk veri çekme tamamlandı");
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
          await this.performDataUpdate();
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
