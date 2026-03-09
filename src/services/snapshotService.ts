/**
 * Snapshot Service - Manages channel metrics snapshots in SQLite database
 * Stores daily snapshots to track growth momentum over time
 */

interface ChannelSnapshot {
  id?: number;
  channelId: string;
  date: string; // ISO 8601 date (YYYY-MM-DD)
  timestamp: number; // Unix milliseconds for sorting
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  estimatedDailyViews: number;
}

interface GrowthMetric {
  date: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  estimatedDailyViews: number;
  subscriberGrowth?: number; // Change from previous day
  viewGrowth?: number; // Change from previous day
  videoGrowth?: number; // Change from previous day
}

/**
 * Get SQLite database instance for snapshots
 */
export function getSnapshotDb() {
  try {
    const Database = require('better-sqlite3');
    const dbPath = require('path').join(process.cwd(), 'channel_snapshots.db');
    const db = new Database(dbPath);
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    
    return db;
  } catch (error) {
    console.error('Failed to initialize snapshot database:', error);
    throw new Error('Database initialization failed. Ensure better-sqlite3 is installed.');
  }
}

/**
 * Initialize the snapshots table if it doesn't exist
 */
export function initializeSnapshotTable() {
  try {
    const db = getSnapshotDb();
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS channel_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channelId TEXT NOT NULL,
        date TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        subscriberCount INTEGER NOT NULL,
        videoCount INTEGER NOT NULL,
        viewCount INTEGER NOT NULL,
        estimatedDailyViews INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channelId, date)
      );
      
      CREATE INDEX IF NOT EXISTS idx_channel_date ON channel_snapshots(channelId, date DESC);
      CREATE INDEX IF NOT EXISTS idx_channel_timestamp ON channel_snapshots(channelId, timestamp DESC);
    `);
    
    console.log('✓ Snapshot database initialized');
  } catch (error) {
    console.error('Failed to initialize snapshot table:', error);
    throw error;
  }
}

/**
 * Save a channel snapshot (upserts if already exists for that day)
 */
export function saveChannelSnapshot(snapshot: ChannelSnapshot): boolean {
  try {
    const db = getSnapshotDb();
    const today = new Date().toISOString().split('T')[0];
    
    const stmt = db.prepare(`
      INSERT INTO channel_snapshots 
        (channelId, date, timestamp, subscriberCount, videoCount, viewCount, estimatedDailyViews)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(channelId, date) DO UPDATE SET
        subscriberCount = excluded.subscriberCount,
        videoCount = excluded.videoCount,
        viewCount = excluded.viewCount,
        estimatedDailyViews = excluded.estimatedDailyViews,
        timestamp = excluded.timestamp
    `);
    
    const result = stmt.run(
      snapshot.channelId,
      snapshot.date || today,
      snapshot.timestamp || Date.now(),
      snapshot.subscriberCount,
      snapshot.videoCount,
      snapshot.viewCount,
      snapshot.estimatedDailyViews || 0
    );
    
    return result.changes > 0;
  } catch (error) {
    console.error('Failed to save channel snapshot:', error);
    return false;
  }
}

/**
 * Get snapshots for a channel within a date range (defaults to last 90 days)
 */
export function getChannelSnapshots(
  channelId: string,
  days: number = 90
): GrowthMetric[] {
  try {
    const db = getSnapshotDb();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString().split('T')[0];
    
    const stmt = db.prepare(`
      SELECT * FROM channel_snapshots
      WHERE channelId = ? AND date >= ?
      ORDER BY date ASC
    `);
    
    const snapshots = stmt.all(channelId, cutoffIso) as ChannelSnapshot[];
    
    if (snapshots.length === 0) {
      return [];
    }
    
    // Calculate growth metrics
    const metrics: GrowthMetric[] = [];
    
    for (let i = 0; i < snapshots.length; i++) {
      const current = snapshots[i];
      const previous = i > 0 ? snapshots[i - 1] : null;
      
      const metric: GrowthMetric = {
        date: current.date,
        subscriberCount: current.subscriberCount,
        videoCount: current.videoCount,
        viewCount: current.viewCount,
        estimatedDailyViews: current.estimatedDailyViews,
      };
      
      if (previous) {
        metric.subscriberGrowth = current.subscriberCount - previous.subscriberCount;
        metric.viewGrowth = current.viewCount - previous.viewCount;
        metric.videoGrowth = current.videoCount - previous.videoCount;
      }
      
      metrics.push(metric);
    }
    
    return metrics;
  } catch (error) {
    console.error('Failed to get channel snapshots:', error);
    return [];
  }
}

/**
 * Get the latest snapshot for a channel
 */
export function getLatestSnapshot(channelId: string): ChannelSnapshot | null {
  try {
    const db = getSnapshotDb();
    
    const stmt = db.prepare(`
      SELECT * FROM channel_snapshots
      WHERE channelId = ?
      ORDER BY date DESC
      LIMIT 1
    `);
    
    return stmt.get(channelId) as ChannelSnapshot | null;
  } catch (error) {
    console.error('Failed to get latest snapshot:', error);
    return null;
  }
}

/**
 * Get snapshot statistics for a channel (growth rates, etc.)
 */
export function getSnapshotStats(channelId: string, days: number = 30) {
  try {
    const db = getSnapshotDb();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffIso = cutoffDate.toISOString().split('T')[0];
    
    // Get first and latest snapshots in the period
    const stmtFirst = db.prepare(`
      SELECT * FROM channel_snapshots
      WHERE channelId = ? AND date >= ?
      ORDER BY date ASC
      LIMIT 1
    `);
    
    const stmtLatest = db.prepare(`
      SELECT * FROM channel_snapshots
      WHERE channelId = ? AND date >= ?
      ORDER BY date DESC
      LIMIT 1
    `);
    
    const first = stmtFirst.get(channelId, cutoffIso) as ChannelSnapshot | null;
    const latest = stmtLatest.get(channelId, cutoffIso) as ChannelSnapshot | null;
    
    if (!first || !latest) {
      return null;
    }
    
    const subscriberGrowth = latest.subscriberCount - first.subscriberCount;
    const subscriberGrowthPct = first.subscriberCount > 0 
      ? ((subscriberGrowth / first.subscriberCount) * 100).toFixed(2)
      : '0';
    
    const viewGrowth = latest.viewCount - first.viewCount;
    const videoGrowth = latest.videoCount - first.videoCount;
    
    // Average daily views in period
    const stmtAvg = db.prepare(`
      SELECT AVG(estimatedDailyViews) as avgDailyViews
      FROM channel_snapshots
      WHERE channelId = ? AND date >= ?
    `);
    
    const avgData = stmtAvg.get(channelId, cutoffIso) as { avgDailyViews: number } | null;
    
    return {
      period: `${days} days`,
      subscriberGrowth,
      subscriberGrowthPct: parseFloat(subscriberGrowthPct),
      viewGrowth,
      videoGrowth,
      avgDailyViews: Math.round(avgData?.avgDailyViews || 0),
    };
  } catch (error) {
    console.error('Failed to get snapshot stats:', error);
    return null;
  }
}

/**
 * Clean up old snapshots (keep last N days)
 */
export function cleanupOldSnapshots(channelId: string, keepDays: number = 180) {
  try {
    const db = getSnapshotDb();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    const cutoffIso = cutoffDate.toISOString().split('T')[0];
    
    const stmt = db.prepare(`
      DELETE FROM channel_snapshots
      WHERE channelId = ? AND date < ?
    `);
    
    const result = stmt.run(channelId, cutoffIso);
    
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old snapshots for channel ${channelId}`);
    }
    
    return result.changes;
  } catch (error) {
    console.error('Failed to cleanup old snapshots:', error);
    return 0;
  }
}

/**
 * Get snapshot data for trending dashboard (7-day, 30-day, 90-day periods)
 */
export function getGrowthMomentum(channelId: string) {
  try {
    const periods = {
      week: getChannelSnapshots(channelId, 7),
      month: getChannelSnapshots(channelId, 30),
      quarter: getChannelSnapshots(channelId, 90),
    };
    
    return periods;
  } catch (error) {
    console.error('Failed to get growth momentum data:', error);
    return { week: [], month: [], quarter: [] };
  }
}
