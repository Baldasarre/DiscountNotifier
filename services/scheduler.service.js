const cron = require("node-cron");
const StradivariusService = require("./stradivarius.service");
const config = require("../config/environment");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("scheduler");

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
      logger.warn("Scheduler zaten başlatılmış");
      return;
    }

    logger.info("Scheduler başlatılıyor...");

    if (this.dataFetchEnabled) {
      await this.runInitialDataFetch();
    } else {
      logger.info("� Veri çekme anahtarı kapalı - ilk çekme atlanıyor");
    }

    this.startPeriodicTasks();

    this.isInitialized = true;
    logger.info("Scheduler başarıyla başlatıldı");
  }

  async runInitialDataFetch() {
    logger.info("� İlk veri çekme işlemi başlatılıyor...");

    try {
      if (this.isDevelopment && !config.FORCE_INITIAL_FETCH) {
        logger.info("� Development modunda Zara otomatik çekme devre dışı");
        logger.info("Manuel Zara fetch için environment değişkeni: FORCE_INITIAL_FETCH=true");
      } else {
        logger.info("� Zara ürünleri çekiliyor...");
        logger.warn("Zara scraping henüz scheduler a entegre edilmedi");
      }

      if (this.isDevelopment && !config.FORCE_STRADIVARIUS_INITIAL_FETCH) {
        logger.info("Development modunda Stradivarius otomatik çekme devre dışı");
        logger.info("Manuel Stradivarius fetch için environment değişkeni: FORCE_STRADIVARIUS_INITIAL_FETCH=true");
      } else {
        logger.info("� Stradivarius ürünleri çekiliyor...");
        const stradivariusInstance = new StradivariusService();
        await stradivariusInstance.scrapeAll();
        logger.info("Stradivarius veri çekme işlemi tamamlandı");
      }

      if (config.FORCE_BERSHKA_CATEGORY_FETCH) {
        logger.info("� Bershka kategorileri çekiliyor...");
        const BershkaService = require("./bershka.service");
        const bershkaInstance = new BershkaService();

        try {
          if (config.ENABLE_BERSHKA_CURL_FETCH) {
            logger.info("CURL ile fresh data çekiliyor ve kategoriler işleniyor...");
            await bershkaInstance.fetchFreshDataWithCurl();
          } else {
            logger.info("� Mevcut test data kullanılıyor...");
            await bershkaInstance.fetchCategoriesFromTestData();
          }
        } catch (curlError) {
          logger.warn("CURL başarısız, mevcut data kullanılıyor...");
          await bershkaInstance.fetchCategoriesFromTestData();
        }

        logger.info("Bershka kategori çekme işlemi tamamlandı");
      } else {
        logger.info("� Development modunda Bershka kategori çekme devre dışı");
        logger.info("Manuel Bershka kategori fetch için environment değişkeni: FORCE_BERSHKA_CATEGORY_FETCH=true");
        logger.info("CURL ile fresh data için: ENABLE_BERSHKA_CURL_FETCH=true");
      }

      if (this.isDevelopment && !config.FORCE_BERSHKA_INITIAL_FETCH) {
        logger.info("� Development modunda Bershka otomatik çekme devre dışı");
        logger.info("Manuel Bershka fetch için environment değişkeni: FORCE_BERSHKA_INITIAL_FETCH=true");
      } else {
        logger.info("� Bershka ürünleri çekiliyor...");
        const BershkaService = require("./bershka.service");
        const bershkaInstance = new BershkaService();
        await bershkaInstance.fetchAllCategoriesProducts();
        logger.info("Bershka veri çekme işlemi tamamlandı");
      }
    } catch (error) {
      logger.error("İlk veri çekme işleminde hata:", error);
    }
  }

  startPeriodicTasks() {
    if (this.isDevelopment && !config.ENABLE_PERIODIC_TASKS) {
      logger.info("⏰ Development modunda periyodik görevler devre dışı");
      logger.info("� Aktif etmek için: ENABLE_PERIODIC_TASKS=true");
      return;
    }

    const dataFetchJob = cron.schedule(
      "0 */6 * * *",
      async () => {
        if (this.dataFetchEnabled) {
          logger.info("� Periyodik veri çekme başlatılıyor...");
          await this.runInitialDataFetch();
        } else {
          logger.info("Veri çekme anahtarı kapalı - periyodik çekme atlanıyor");
        }
      },
      {
        scheduled: false,
        timezone: "Europe/Istanbul",
      }
    );

    this.jobs.set("dataFetch", dataFetchJob);
    dataFetchJob.start();

    logger.info("⏰ Periyodik görevler başlatıldı:");
    logger.info("- Veri çekme: Her 6 saatte bir");
    logger.info(`- Anahtar durumu: ${this.dataFetchEnabled ? "AÇIK" : "KAPALI"}`);
  }

  toggleDataFetch() {
    this.dataFetchEnabled = !this.dataFetchEnabled;
    const status = this.dataFetchEnabled ? "AÇIK" : "KAPALI";
    logger.info("�� Veri çekme anahtarı ${status} yapıldı");
    return this.dataFetchEnabled;
  }

  enableDataFetch() {
    this.dataFetchEnabled = true;
    logger.info("� Veri çekme anahtarı AÇIK yapıldı");
    return true;
  }

  disableDataFetch() {
    this.dataFetchEnabled = false;
    logger.info("� Veri çekme anahtarı KAPALI yapıldı");
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
      logger.info("⏹  ${jobName} görevi durduruldu");
    }
  }

  startJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      logger.info("▶  ${jobName} görevi başlatıldı");
    }
  }

  stopAll() {
    this.jobs.forEach((job, name) => {
      job.stop();
      logger.info("⏹  ${name} görevi durduruldu");
    });

    this.isInitialized = false;
    logger.info("� Tüm scheduled görevler durduruldu");
  }

  async performDataUpdate() {
    if (!this.dataFetchEnabled) {
      logger.info("� Veri çekme anahtarı kapalı - güncelleme atlanıyor");
      return false;
    }

    try {
      logger.debug("Yeni ürün kontrolü başlatılıyor...");

      const hasNewProducts = await zaraService.checkForNewProducts();

      if (hasNewProducts) {
        logger.info("🆕 Yeni ürünler tespit edildi - tam güncelleme yapılıyor...");
        await zaraService.fetchAndSaveAllProducts();
        return true;
      } else {
        logger.info("Yeni ürün yok - mevcut verilerle devam ediliyor");
        return false;
      }
    } catch (error) {
      logger.error("Veri güncelleme hatası:", error);
      return false;
    }
  }

  async triggerManualUpdate(brand = "zara", forceFullUpdate = false, jobId = null) {
    logger.info(`🔄 Manuel ${brand} güncellemesi başlatılıyor...`);

    try {
      if (brand === "zara") {
        logger.info("🚀 Zara ürünleri çekiliyor...");
        await zaraService.fetchAndSaveAllProducts(true, jobId);
        logger.info("✅ Manuel Zara güncellemesi tamamlandı");
        return true;
      } else if (brand === "bershka") {
        logger.info("🚀 Bershka ürünleri çekiliyor...");
        await bershkaService.fetchAllCategoriesProducts(jobId);
        logger.info("✅ Manuel Bershka güncellemesi tamamlandı");
        return true;
      } else if (brand === "stradivarius") {
        logger.info("🚀 Stradivarius ürünleri çekiliyor...");
        const StradivariusService = require("./stradivarius.service");
        const stradivariusInstance = new StradivariusService();
        await stradivariusInstance.scrapeAll(jobId);
        logger.info("✅ Manuel Stradivarius güncellemesi tamamlandı");
        return true;
      } else {
        logger.error(`❌ ${brand} markası henüz desteklenmiyor`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ Manuel ${brand} güncellemesinde hata:`, error);
      throw error; // Re-throw so caller can handle it
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