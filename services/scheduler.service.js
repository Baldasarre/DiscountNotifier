const cron = require('node-cron');
const zaraService = require('./zara.service');
const config = require('../config/environment');

class SchedulerService {
    constructor() {
        this.jobs = new Map();
        this.isInitialized = false;
        this.isDevelopment = config.NODE_ENV === 'development';
    }

    /**
     * Scheduler'ı başlat
     */
    async initialize() {
        if (this.isInitialized) {
            console.log('⚠️  Scheduler zaten başlatılmış');
            return;
        }

        console.log('🚀 Scheduler başlatılıyor...');
        
        // İlk çalıştırmada verileri çek
        await this.runInitialDataFetch();
        
        // Periyodik görevleri başlat
        this.startPeriodicTasks();
        
        this.isInitialized = true;
        console.log('✅ Scheduler başarıyla başlatıldı');
    }

    /**
     * İlk veri çekme işlemi
     */
    async runInitialDataFetch() {
        // Development modunda otomatik fetch yapma
        if (this.isDevelopment && !config.FORCE_INITIAL_FETCH) {
            console.log('🔄 Development modunda otomatik veri çekme devre dışı');
            console.log('💡 Manuel fetch için: POST /api/products/refresh');
            return;
        }
        
        console.log('📡 İlk veri çekme işlemi başlatılıyor...');
        
        try {
            // Zara cache kontrolü
            const zaraCache = await zaraService.getCacheMetadata('zara_men_products');
            
            if (!zaraCache || this.isCacheExpired(zaraCache.next_update)) {
                console.log('🔄 Zara verileri güncel değil, yeniden çekiliyor...');
                await zaraService.fetchAndSaveAllProducts();
            } else {
                console.log('✅ Zara verileri güncel');
            }
        } catch (error) {
            console.error('❌ İlk veri çekme işleminde hata:', error);
        }
    }

    /**
     * Periyodik görevleri başlat
     */
    startPeriodicTasks() {
        // Development modunda periyodik görevleri kontrol et
        if (this.isDevelopment && !config.ENABLE_PERIODIC_TASKS) {
            console.log('⏰ Development modunda periyodik görevler devre dışı');
            console.log('💡 Aktif etmek için: ENABLE_PERIODIC_TASKS=true');
            return;
        }

        // Her 45-60 dakika arasında random cache kontrolü yap
        const cacheCheckJob = cron.schedule('0 */1 * * *', async () => {
            // Random delay ekle (45-60 dakika arası)
            const randomDelay = Math.floor(Math.random() * (60 - 45 + 1)) + 45;
            const nextCheckTime = new Date(Date.now() + randomDelay * 60 * 1000);
            console.log(`⏰ Cache kontrolü ${randomDelay} dakika sonra yapılacak...`);
            console.log(`📅 Bir sonraki kontrol: ${nextCheckTime.toLocaleString('tr-TR')}`);
            
            setTimeout(async () => {
                await this.checkAndUpdateCache();
            }, randomDelay * 60 * 1000);
        }, {
            scheduled: false,
            timezone: "Europe/Istanbul"
        });

        // Her gece 3:00'da full sync yap
        const dailySyncJob = cron.schedule('0 3 * * *', async () => {
            console.log('🌙 Günlük tam senkronizasyon başlatılıyor...');
            await zaraService.fetchAndSaveAllProducts();
        }, {
            scheduled: false,
            timezone: "Europe/Istanbul"
        });

        // Görevleri kaydet ve başlat
        this.jobs.set('cacheCheck', cacheCheckJob);
        this.jobs.set('dailySync', dailySyncJob);

        cacheCheckJob.start();
        dailySyncJob.start();

        console.log('⏰ Periyodik görevler başlatıldı:');
        console.log('   - Cache kontrolü: Her 45-60 dakika arası random');
        console.log('   - Günlük sync: Her gece 03:00');
    }

    /**
     * Cache kontrolü ve güncelleme
     */
    async checkAndUpdateCache() {
        try {
            const zaraCache = await zaraService.getCacheMetadata('zara_men_products');
            
            if (!zaraCache) {
                console.log('📡 Cache bulunamadı, ilk veri çekme işlemi başlatılıyor...');
                await zaraService.fetchAndSaveAllProducts();
                return;
            }

            if (this.isCacheExpired(zaraCache.next_update)) {
                console.log('🔄 Cache süresi dolmuş, yeniden çekiliyor...');
                await zaraService.fetchAndSaveAllProducts();
            } else {
                const nextUpdate = new Date(zaraCache.next_update);
                const now = new Date();
                const minutesLeft = Math.ceil((nextUpdate - now) / (1000 * 60));
                console.log(`⏳ Cache güncel, ${minutesLeft} dakika sonra güncelleme`);
                console.log(`📅 Bir sonraki güncelleme: ${nextUpdate.toLocaleString('tr-TR')}`);
            }
        } catch (error) {
            console.error('❌ Cache kontrolünde hata:', error);
        }
    }

    /**
     * Cache'in süresi dolmuş mu kontrol et
     */
    isCacheExpired(nextUpdateTime) {
        if (!nextUpdateTime) return true;
        
        const nextUpdate = new Date(nextUpdateTime);
        const now = new Date();
        
        return now >= nextUpdate;
    }

    /**
     * Belirli bir görevi durdur
     */
    stopJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.stop();
            console.log(`⏹️  ${jobName} görevi durduruldu`);
        }
    }

    /**
     * Belirli bir görevi başlat
     */
    startJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.start();
            console.log(`▶️  ${jobName} görevi başlatıldı`);
        }
    }

    /**
     * Tüm görevleri durdur
     */
    stopAll() {
        this.jobs.forEach((job, name) => {
            job.stop();
            console.log(`⏹️  ${name} görevi durduruldu`);
        });
        
        this.isInitialized = false;
        console.log('🛑 Tüm scheduled görevler durduruldu');
    }

    /**
     * Manuel veri çekme işlemi tetikle
     */
    async triggerManualUpdate(brand = 'zara') {
        console.log(`🔄 Manuel ${brand} güncellemesi başlatılıyor...`);
        
        try {
            if (brand === 'zara') {
                await zaraService.fetchAndSaveAllProducts();
                console.log('✅ Manuel Zara güncellemesi tamamlandı');
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

    /**
     * Scheduler durumunu al
     */
    getStatus() {
        const status = {
            isInitialized: this.isInitialized,
            activeJobs: [],
            totalJobs: this.jobs.size
        };

        this.jobs.forEach((job, name) => {
            status.activeJobs.push({
                name,
                running: job.running || false
            });
        });

        return status;
    }

    /**
     * Random delay ekle (rate limiting için)
     */
    getRandomDelay(min = 30000, max = 120000) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

module.exports = new SchedulerService();
