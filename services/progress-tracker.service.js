const EventEmitter = require('events');
const { createServiceLogger } = require('../utils/logger');

const logger = createServiceLogger('progress-tracker');

class ProgressTracker extends EventEmitter {
  constructor() {
    super();
    this.activeJobs = new Map();
  }

  startJob(jobId, totalItems = 0) {
    const job = {
      jobId,
      status: 'running',
      totalItems,
      processedItems: 0,
      savedItems: 0,
      currentCategory: '',
      startTime: Date.now(),
      lastUpdate: Date.now()
    };

    this.activeJobs.set(jobId, job);
    logger.info(`Job started: ${jobId}`);
    this.emitProgress(jobId);
    return job;
  }

  updateProgress(jobId, updates) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      logger.warn(`Job not found: ${jobId}`);
      return;
    }

    Object.assign(job, updates, { lastUpdate: Date.now() });
    this.emitProgress(jobId);
  }

  incrementProcessed(jobId, count = 1) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.processedItems += count;
    job.lastUpdate = Date.now();
    this.emitProgress(jobId);
  }

  incrementSaved(jobId, count = 1) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.savedItems += count;
    job.lastUpdate = Date.now();
    this.emitProgress(jobId);
  }

  setCurrentCategory(jobId, categoryName) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.currentCategory = categoryName;
    job.lastUpdate = Date.now();
    this.emitProgress(jobId);
  }

  completeJob(jobId, totalSaved = null) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.lastUpdate = Date.now();
    if (totalSaved !== null) {
      job.savedItems = totalSaved;
    }

    this.emitProgress(jobId);
    logger.info(`Job completed: ${jobId} - ${job.savedItems} items saved`);

    // Clean up after 30 seconds
    setTimeout(() => {
      this.activeJobs.delete(jobId);
      logger.debug(`Job cleaned up: ${jobId}`);
    }, 30000);
  }

  failJob(jobId, error) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error.message || String(error);
    job.lastUpdate = Date.now();

    this.emitProgress(jobId);
    logger.error(`Job failed: ${jobId} - ${job.error}`);
  }

  emitProgress(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      logger.warn(`emitProgress called for non-existent job: ${jobId}`);
      return;
    }

    const progress = {
      ...job,
      percentage: job.totalItems > 0
        ? Math.round((job.processedItems / job.totalItems) * 100)
        : 0,
      elapsedTime: Date.now() - job.startTime
    };

    logger.debug(`Emitting progress for ${jobId}: ${progress.percentage}% (${progress.processedItems}/${progress.totalItems})`);
    this.emit('progress', progress);
    this.emit(`progress:${jobId}`, progress);
  }

  getJob(jobId) {
    return this.activeJobs.get(jobId);
  }

  getAllJobs() {
    return Array.from(this.activeJobs.values());
  }
}

module.exports = new ProgressTracker();
