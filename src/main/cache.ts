import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * HistoricDataCache manages caching of eBird historic observations
 * Storage location: ~/.ebird-cache/{region}/{YYYY}/{MM}/{DD}.json
 */
export class HistoricDataCache {
  private cacheBaseDir: string

  constructor() {
    this.cacheBaseDir = path.join(os.homedir(), '.ebird-cache')
    this.ensureBaseDirExists()
  }

  private ensureBaseDirExists(): void {
    if (!fs.existsSync(this.cacheBaseDir)) {
      fs.mkdirSync(this.cacheBaseDir, { recursive: true })
    }
  }

  private getCachePath(
    region: string,
    year: number,
    month: number,
    day: number
  ): string {
    const monthStr = String(month).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    return path.join(
      this.cacheBaseDir,
      region,
      String(year),
      monthStr,
      `${dayStr}.json`
    )
  }

  private ensurePathExists(filePath: string): void {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * Retrieve cached observations for a specific date
   * @returns Array of observations, or null if not cached
   */
  get(region: string, year: number, month: number, day: number): any[] | null {
    try {
      const cachePath = this.getCachePath(region, year, month, day)
      if (fs.existsSync(cachePath)) {
        const data = fs.readFileSync(cachePath, 'utf-8')
        return JSON.parse(data)
      }
      return null
    } catch (err) {
      console.error(
        `Cache read error for ${region}/${year}/${month}/${day}:`,
        err
      )
      return null
    }
  }

  /**
   * Store observations for a specific date
   */
  set(
    region: string,
    year: number,
    month: number,
    day: number,
    data: any[]
  ): void {
    try {
      const cachePath = this.getCachePath(region, year, month, day)
      this.ensurePathExists(cachePath)
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (err) {
      console.error(
        `Cache write error for ${region}/${year}/${month}/${day}:`,
        err
      )
    }
  }

  /**
   * Check if a specific date is cached
   */
  isCached(region: string, year: number, month: number, day: number): boolean {
    const cachePath = this.getCachePath(region, year, month, day)
    return fs.existsSync(cachePath)
  }

  /**
   * Clear all cache or specific region cache
   */
  clear(region?: string): void {
    try {
      if (region) {
        const regionPath = path.join(this.cacheBaseDir, region)
        if (fs.existsSync(regionPath)) {
          fs.rmSync(regionPath, { recursive: true, force: true })
        }
      } else {
        fs.rmSync(this.cacheBaseDir, { recursive: true, force: true })
        this.ensureBaseDirExists()
      }
      console.log(`Cache cleared${region ? ` for ${region}` : ''}`)
    } catch (err) {
      console.error('Cache clear error:', err)
    }
  }

  /**
   * Get cache size for a region in MB
   */
  getCacheSize(region?: string): number {
    try {
      const targetPath = region
        ? path.join(this.cacheBaseDir, region)
        : this.cacheBaseDir

      if (!fs.existsSync(targetPath)) return 0

      let size = 0
      const walkDir = (dir: string) => {
        const files = fs.readdirSync(dir)
        files.forEach((file) => {
          const filePath = path.join(dir, file)
          const stat = fs.statSync(filePath)
          if (stat.isDirectory()) {
            walkDir(filePath)
          } else {
            size += stat.size
          }
        })
      }

      walkDir(targetPath)
      return Math.round((size / 1024 / 1024) * 100) / 100 // Convert to MB
    } catch (err) {
      console.error('Cache size calculation error:', err)
      return 0
    }
  }
}

/**
 * ThrottledRequester manages API requests with rate limiting
 * Ensures no more than N requests per second
 */
export class ThrottledRequester {
  private queue: Array<{
    fn: () => Promise<any>
    resolve: (value: any) => void
    reject: (error: any) => void
  }> = []
  private processing = false
  private requestsPerSecond: number

  constructor(requestsPerSecond: number = 1) {
    this.requestsPerSecond = requestsPerSecond
  }

  /**
   * Enqueue a request function to be executed with throttling
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processQueue()
    })
  }

  /**
   * Process the queue with throttling
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true
    const delayMs = (1000 / this.requestsPerSecond) | 0

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift()!

      try {
        const result = await fn()
        resolve(result)
      } catch (error) {
        reject(error)
      }

      // Wait before next request
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }

    this.processing = false
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = []
    this.processing = false
  }
}
