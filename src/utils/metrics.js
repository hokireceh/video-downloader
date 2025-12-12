/**
 * Upload Metrics Tracker
 * Tracks upload success rates and performance statistics
 */

const uploadMetrics = {
  totalUploads: 0,
  successfulUploads: 0,
  failedUploads: 0,
  totalRetries: 0,
  retrySuccesses: 0,
  startTime: Date.now(),

  recordUploadSuccess(retryCount = 0) {
    this.totalUploads++;
    this.successfulUploads++;
    if (retryCount > 0) {
      this.totalRetries += retryCount;
      this.retrySuccesses++;
    }
  },

  recordUploadFailure() {
    this.totalUploads++;
    this.failedUploads++;
  },

  getSuccessRate() {
    if (this.totalUploads === 0) return 0;
    return ((this.successfulUploads / this.totalUploads) * 100).toFixed(2);
  },

  getRetrySuccessRate() {
    if (this.retrySuccesses === 0) return 0;
    return ((this.retrySuccesses / this.totalRetries) * 100).toFixed(2);
  },

  getStats() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
      totalUploads: this.totalUploads,
      successfulUploads: this.successfulUploads,
      failedUploads: this.failedUploads,
      successRate: `${this.getSuccessRate()}%`,
      totalRetries: this.totalRetries,
      retrySuccesses: this.retrySuccesses,
      retrySuccessRate: `${this.getRetrySuccessRate()}%`
    };
  },

  logStats() {
    const stats = this.getStats();
    console.log('[METRICS] ═══════════════════════════════════════════════════');
    console.log(`[METRICS] Uptime: ${stats.uptime}`);
    console.log(`[METRICS] Total Uploads: ${stats.totalUploads} (✅ ${stats.successfulUploads} | ❌ ${stats.failedUploads})`);
    console.log(`[METRICS] Success Rate: ${stats.successRate}`);
    console.log(`[METRICS] Retries: ${stats.totalRetries} total, ${stats.retrySuccesses} succeeded (${stats.retrySuccessRate}%)`);
    console.log('[METRICS] ═══════════════════════════════════════════════════');
  }
};

module.exports = uploadMetrics;
