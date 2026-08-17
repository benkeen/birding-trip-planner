import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type {
  AuthPayload,
  AuthResponse,
  User,
  CreateTripRequest
} from '@shared/types'
import { HistoricDataCache, ThrottledRequester } from './cache'
import {
  getUserByEmail,
  createUser,
  getUserById,
  getUserPasswordHash,
  getUserTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,
  getCacheData,
  setCacheData,
  getOrCreateSpecies
} from './db'

const JWT_SECRET = 'your-secret-key-change-in-production'

export function createExpressApp(): express.Application {
  const app = express()

  app.use(cors())
  app.use(bodyParser.json())

  // Middleware to verify JWT token
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
      req.userId = decoded.userId
      next()
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' })
    }
  }

  // Auth routes
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    const { email, password } = req.body as AuthPayload

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const existing = getUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'User already exists' })
    }

    try {
      const passwordHash = await bcrypt.hash(password, 10)
      const user = createUser(email, passwordHash)
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: '7d'
      })
      res.json({ token, user } as AuthResponse)
    } catch (err) {
      res.status(500).json({ error: 'Failed to create user' })
    }
  })

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body as AuthPayload

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const user = getUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    try {
      const passwordHash = getUserPasswordHash(email)
      if (!passwordHash) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const valid = await bcrypt.compare(password, passwordHash)
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: '7d'
      })
      res.json({ token, user } as AuthResponse)
    } catch (err) {
      res.status(500).json({ error: 'Login failed' })
    }
  })

  // Get current user
  app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
    const user = getUserById(req.userId!)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    res.json(user)
  })

  // eBird API proxy routes
  const EBIRD_API_BASE = 'https://api.ebird.org/v2'

  // Initialize cache and throttler
  const cache = new HistoricDataCache()
  const throttler = new ThrottledRequester(1) // 1 request per second

  // Progress tracking for polling-based updates
  interface ProgressState {
    sessionId: string
    region: string
    startDate: string
    endDate: string
    apiKey: string
    forceRefresh: boolean
    current: number
    total: number
    species?: Array<{
      code: string
      comName: string
      sciName: string
      checklistFrequency: number
      totalReports: number
    }>
    error?: string
    done: boolean
    startTime: number
  }

  const progressMap = new Map<string, ProgressState>()

  // Validate eBird API key
  app.post('/api/ebird/validate-key', async (req: Request, res: Response) => {
    const { api_key } = req.body as { api_key: string }

    if (!api_key) {
      return res.status(400).json({ error: 'API key required' })
    }

    try {
      // Use a lightweight endpoint with the correct header format
      const response = await fetch(
        `${EBIRD_API_BASE}/ref/region/list/subnational1/US`,
        { headers: { 'X-eBirdApiToken': api_key } }
      )
      if (!response.ok) {
        return res.status(401).json({ error: 'Invalid API key' })
      }
      res.json({ valid: true })
    } catch (err) {
      res.status(500).json({ error: 'Failed to validate API key' })
    }
  })

  // Start historic data fetch with polling support
  app.post(
    '/api/ebird/historic-start/:region',
    async (req: Request, res: Response) => {
      const { region } = req.params
      const { api_key, start_date, end_date, force_refresh } = req.body as {
        api_key: string
        start_date: string
        end_date: string
        force_refresh?: boolean
      }

      if (!api_key || !start_date || !end_date) {
        return res.status(400).json({
          error: 'api_key, start_date, and end_date required'
        })
      }

      const sessionId = `${region}-${Date.now()}-${Math.random().toString(36).slice(2)}`

      // Create progress state
      const progressState: ProgressState = {
        sessionId,
        region,
        startDate: start_date,
        endDate: end_date,
        apiKey: api_key,
        forceRefresh: force_refresh || false,
        current: 0,
        total: 0,
        done: false,
        startTime: Date.now()
      }

      progressMap.set(sessionId, progressState)

      // Start fetch in background (don't await)
      ;(async () => {
        try {
          // Parse dates in local timezone
          const parseDate = (dateStr: string) => {
            const [year, month, day] = dateStr.split('-').map(Number)
            return { year, month, day, date: new Date(year, month - 1, day) }
          }

          const startParsed = parseDate(start_date)
          const endParsed = parseDate(end_date)
          const startDateObj = startParsed.date
          const endDateObj = endParsed.date

          if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
            progressState.error = 'Invalid date format'
            progressState.done = true
            return
          }

          // Generate all dates to fetch
          const datesToFetch: Array<{
            year: number
            month: number
            day: number
          }> = []
          const currentYear = new Date().getFullYear()

          let currentDate = new Date(startDateObj)
          while (currentDate <= endDateObj) {
            const month = currentDate.getMonth() + 1
            const day = currentDate.getDate()

            for (let yearsBack = 1; yearsBack <= 20; yearsBack++) {
              const year = currentYear - yearsBack
              datesToFetch.push({ year, month, day })
            }

            currentDate.setDate(currentDate.getDate() + 1)
          }

          progressState.total = datesToFetch.length

          console.log(
            `📋 Processing ${datesToFetch.length} dates - forceRefresh=${progressState.forceRefresh}, shouldUseCache=${progressState.forceRefresh !== true}`
          )

          // Collect observations
          const speciesChecklistMap: Record<string, Set<string>> = {}
          const speciesObsCount: Record<string, number> = {}
          const speciesMetadata: Record<
            string,
            { comName: string; sciName: string }
          > = {}
          const allChecklists = new Set<string>()
          let totalObs = 0

          const aggregateObservations = (data: any[]) => {
            for (const obs of data) {
              const code = obs.speciesCode
              const checklistId = `${obs.locId}_${obs.obsDt}`

              allChecklists.add(checklistId)

              if (!speciesChecklistMap[code]) {
                speciesChecklistMap[code] = new Set()
              }
              speciesChecklistMap[code].add(checklistId)

              speciesObsCount[code] = (speciesObsCount[code] || 0) + 1
              totalObs++

              if (!speciesMetadata[code]) {
                speciesMetadata[code] = {
                  comName: obs.comName || code,
                  sciName: obs.sciName || 'Unknown'
                }
              }
            }
          }

          // Process all dates
          for (const dateObj of datesToFetch) {
            const { year, month, day } = dateObj
            const shouldUseCache = progressState.forceRefresh !== true
            const cacheExists = cache.isCached(region, year, month, day)
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

            console.log(
              `[DEBUG] Checking ${dateStr}: shouldUseCache=${shouldUseCache}, cacheExists=${cacheExists}`
            )

            if (shouldUseCache && cacheExists) {
              const cachedData = cache.get(region, year, month, day)
              console.log(`[DEBUG] Read from cache: ${cachedData ? cachedData.length : 0} items`)
              if (cachedData) {
                aggregateObservations(cachedData)
                progressState.current++
                console.log(
                  `✅ [${progressState.current}/${progressState.total}] ${dateStr} - CACHE (${cachedData.length} obs)`
                )
                continue
              }
            }

            // If we reach here, fetch from API
            if (!shouldUseCache) {
              console.log(`⏭️  Skipping cache due to forceRefresh=true`)
            } else if (!cacheExists) {
              console.log(`🆕 Cache miss for ${dateStr}`)
            }

            // Fetch from API
            await throttler.enqueue(async () => {
              try {
                const monthStr = String(month).padStart(2, '0')
                const dayStr = String(day).padStart(2, '0')
                const historicUrl = `${EBIRD_API_BASE}/data/obs/${region}/historic/${year}/${monthStr}/${dayStr}?maxResults=10000`

                const response = await fetch(historicUrl, {
                  headers: { 'X-eBirdApiToken': api_key }
                })

                if (response.ok) {
                  const data = await response.json()
                  cache.set(region, year, month, day, data)
                  aggregateObservations(data)
                  progressState.current++
                  console.log(
                    `🌐 [${progressState.current}/${progressState.total}] ${year}-${monthStr}-${dayStr} - API (${data.length || 0} observations)`
                  )
                } else {
                  progressState.current++
                  console.log(
                    `⚠️  [${progressState.current}/${progressState.total}] ${year}-${monthStr}-${dayStr} - API ERROR (${response.status})`
                  )
                }
              } catch (err) {
                progressState.current++
                console.error(
                  `❌ [${progressState.current}/${progressState.total}] ${year}-${month}-${day} - FETCH ERROR`,
                  err
                )
              }
            })
          }

          // Build final species array
          const totalChecklists = allChecklists.size
          const species = Object.entries(speciesObsCount)
            .map(([code, count]) => ({
              code,
              comName: speciesMetadata[code]?.comName || code,
              sciName: speciesMetadata[code]?.sciName || 'Unknown',
              checklistFrequency:
                totalChecklists > 0
                  ? speciesChecklistMap[code].size / totalChecklists
                  : 0,
              totalReports: count
            }))
            .sort((a, b) => b.checklistFrequency - a.checklistFrequency)

          progressState.species = species
          progressState.done = true

          console.log(
            `✨ Historic data complete: ${progressState.current}/${progressState.total} dates processed, ${species.length} unique species`
          )

          // Clean up session after 10 minutes
          setTimeout(() => {
            progressMap.delete(sessionId)
          }, 600000)
        } catch (err) {
          progressState.error =
            err instanceof Error ? err.message : 'Unknown error'
          progressState.done = true
          console.error('Error in historic-start background process:', err)
        }
      })()

      res.json({ sessionId })
    }
  )

  // Check progress of historic data fetch
  app.get(
    '/api/ebird/historic-progress/:sessionId',
    (req: Request, res: Response) => {
      const { sessionId } = req.params

      const state = progressMap.get(sessionId)
      if (!state) {
        return res.status(404).json({ error: 'Session not found' })
      }

      // If done, send full response with species data
      if (state.done) {
        if (state.error) {
          return res.json({
            sessionId,
            done: true,
            error: state.error,
            current: state.current,
            total: state.total
          })
        }

        res.json({
          sessionId,
          done: true,
          current: state.current,
          total: state.total,
          species: state.species || [],
          region: state.region,
          startDate: state.startDate,
          endDate: state.endDate
        })
        return
      }

      // Still in progress, send progress update
      const elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000)
      const estimatedSeconds =
        state.current > 0
          ? Math.floor(
              (elapsedSeconds / state.current) * (state.total - state.current)
            )
          : 0

      res.json({
        sessionId,
        done: false,
        current: state.current,
        total: state.total,
        estimatedSeconds
      })
    }
  )

  // Get historic observations for a region across 20 years (with streaming progress)
  app.get(
    '/api/ebird/historic-stream/:region',
    async (req: Request, res: Response) => {
      const { region } = req.params
      const { api_key, start_date, end_date, force_refresh } = req.query as {
        api_key: string
        start_date?: string
        end_date?: string
        force_refresh?: string
      }

      if (!api_key) {
        return res.status(400).json({ error: 'API key required' })
      }

      if (!start_date || !end_date) {
        return res
          .status(400)
          .json({ error: 'start_date and end_date required' })
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')

      try {
        // Parse dates in local timezone (not UTC)
        const parseDate = (dateStr: string) => {
          const [year, month, day] = dateStr.split('-').map(Number)
          return { year, month, day, date: new Date(year, month - 1, day) }
        }

        const startParsed = parseDate(start_date)
        const endParsed = parseDate(end_date)
        const startDateObj = startParsed.date
        const endDateObj = endParsed.date

        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
          res.write('data: {"error": "Invalid date format"}\n\n')
          res.end()
          return
        }

        // Generate all dates to fetch
        const datesToFetch: Array<{
          year: number
          month: number
          day: number
        }> = []
        const currentYear = new Date().getFullYear()

        let currentDate = new Date(startDateObj)
        while (currentDate <= endDateObj) {
          const month = currentDate.getMonth() + 1
          const day = currentDate.getDate()

          for (let yearsBack = 1; yearsBack <= 20; yearsBack++) {
            const year = currentYear - yearsBack
            datesToFetch.push({ year, month, day })
          }

          currentDate.setDate(currentDate.getDate() + 1)
        }

        console.log(`SSE: Starting to fetch ${datesToFetch.length} dates`)
        res.write(`data: ${JSON.stringify({ total: datesToFetch.length })}\n\n`)

        // Collect observations and calculate frequency
        const speciesChecklistMap: Record<string, Set<string>> = {}
        const speciesObsCount: Record<string, number> = {}
        const speciesMetadata: Record<
          string,
          { comName: string; sciName: string }
        > = {}
        const allChecklists = new Set<string>()
        let totalObs = 0
        let completedCount = 0

        const aggregateObservations = (data: any[]) => {
          for (const obs of data) {
            const code = obs.speciesCode
            const checklistId = `${obs.locId}_${obs.obsDt}`

            allChecklists.add(checklistId)

            if (!speciesChecklistMap[code]) {
              speciesChecklistMap[code] = new Set()
            }
            speciesChecklistMap[code].add(checklistId)

            speciesObsCount[code] = (speciesObsCount[code] || 0) + 1
            totalObs++

            if (!speciesMetadata[code]) {
              speciesMetadata[code] = {
                comName: obs.comName || code,
                sciName: obs.sciName || 'Unknown'
              }
            }
          }
        }

        // Create wrapper for throttled requests that sends progress
        const processDateWithProgress = async (dateObj: {
          year: number
          month: number
          day: number
        }) => {
          const { year, month, day } = dateObj
          const shouldUseCache = force_refresh !== 'true'

          // Check cache first
          if (shouldUseCache && cache.isCached(region, year, month, day)) {
            const cachedData = cache.get(region, year, month, day)
            if (cachedData) {
              aggregateObservations(cachedData)
              completedCount++
              console.log(
                `✅ [${completedCount}/${datesToFetch.length}] ${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} - CACHE`
              )
              res.write(
                `data: ${JSON.stringify({ current: completedCount, total: datesToFetch.length })}\n\n`
              )
              return
            }
          }

          // Fetch from API
          const monthStr = String(month).padStart(2, '0')
          const dayStr = String(day).padStart(2, '0')
          const historicUrl = `${EBIRD_API_BASE}/data/obs/${region}/historic/${year}/${monthStr}/${dayStr}?maxResults=10000`

          try {
            const response = await fetch(historicUrl, {
              headers: { 'X-eBirdApiToken': api_key }
            })

            if (response.ok) {
              const data = await response.json()
              cache.set(region, year, month, day, data)
              aggregateObservations(data)
              completedCount++
              console.log(
                `🌐 [${completedCount}/${datesToFetch.length}] ${year}-${monthStr}-${dayStr} - API (${data.length || 0} observations)`
              )
            } else {
              completedCount++
              console.log(
                `⚠️  [${completedCount}/${datesToFetch.length}] ${year}-${monthStr}-${dayStr} - API ERROR (${response.status})`
              )
            }
          } catch (err) {
            completedCount++
            console.error(
              `❌ [${completedCount}/${datesToFetch.length}] ${year}-${monthStr}-${dayStr} - FETCH ERROR`,
              err
            )
          }

          // Send progress update
          res.write(
            `data: ${JSON.stringify({ current: completedCount, total: datesToFetch.length })}\n\n`
          )
        }

        // Queue all requests through throttler and wait for all to complete
        const promises = datesToFetch.map((dateObj) =>
          throttler.enqueue(() => processDateWithProgress(dateObj))
        )

        // Wait for all requests to complete
        await Promise.all(promises)

        console.log(`SSE: All ${completedCount} requests completed`)

        // Build final species array
        const totalChecklists = allChecklists.size
        const species = Object.entries(speciesObsCount)
          .map(([code, count]) => ({
            code,
            comName: speciesMetadata[code]?.comName || code,
            sciName: speciesMetadata[code]?.sciName || 'Unknown',
            checklistFrequency:
              totalChecklists > 0
                ? speciesChecklistMap[code].size / totalChecklists
                : 0,
            totalReports: count
          }))
          .sort((a, b) => b.checklistFrequency - a.checklistFrequency)

        // Send final data
        res.write(
          `data: ${JSON.stringify({
            done: true,
            region,
            date_range: { start: start_date, end: end_date },
            years_back: 20,
            total_observations: totalObs,
            unique_species: species.length,
            species
          })}\n\n`
        )

        res.end()
      } catch (err) {
        console.error('Error in historic stream:', err)
        res.write(
          `data: ${JSON.stringify({ error: 'Failed to fetch historic observations' })}\n\n`
        )
        res.end()
      }
    }
  )

  // Get historic observations for a region across 20 years
  app.get(
    '/api/ebird/historic/:region',
    async (req: Request, res: Response) => {
      const { region } = req.params
      const { api_key, start_date, end_date, force_refresh } = req.query as {
        api_key: string
        start_date?: string
        end_date?: string
        force_refresh?: string
      }

      if (!api_key) {
        return res.status(400).json({ error: 'API key required' })
      }

      if (!start_date || !end_date) {
        return res
          .status(400)
          .json({ error: 'start_date and end_date required' })
      }

      try {
        console.log(
          `Received request: start_date=${start_date}, end_date=${end_date}, region=${region}`
        )

        // Parse dates in local timezone (not UTC)
        const parseDate = (dateStr: string) => {
          const [year, month, day] = dateStr.split('-').map(Number)
          return { year, month, day, date: new Date(year, month - 1, day) }
        }

        const startParsed = parseDate(start_date)
        const endParsed = parseDate(end_date)
        const startDateObj = startParsed.date
        const endDateObj = endParsed.date

        console.log(
          `Parsed dates: start=${startParsed.year}-${startParsed.month}-${startParsed.day}, end=${endParsed.year}-${endParsed.month}-${endParsed.day}`
        )
        console.log(`Date objects: start=${startDateObj}, end=${endDateObj}`)

        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
          return res
            .status(400)
            .json({ error: 'Invalid date format (use YYYY-MM-DD)' })
        }

        // Generate all dates to fetch (9 days × 20 years = 180 requests)
        const datesToFetch: Array<{
          year: number
          month: number
          day: number
        }> = []
        const currentYear = new Date().getFullYear()

        // Iterate through each day in the trip date range
        let currentDate = new Date(startDateObj)
        while (currentDate <= endDateObj) {
          const month = currentDate.getMonth() + 1
          const day = currentDate.getDate()

          // Go back 20 years (current year - 1 through current year - 20)
          for (let yearsBack = 1; yearsBack <= 20; yearsBack++) {
            const year = currentYear - yearsBack
            datesToFetch.push({ year, month, day })
          }

          currentDate.setDate(currentDate.getDate() + 1)
        }

        console.log(
          `Historic observations: fetching ${datesToFetch.length} dates for ${region}`
        )

        // Collect observations and calculate frequency
        // Track unique checklists per species
        const speciesChecklistMap: Record<string, Set<string>> = {}
        const speciesObsCount: Record<string, number> = {}
        const speciesMetadata: Record<
          string,
          { comName: string; sciName: string }
        > = {}
        const allChecklists = new Set<string>()
        let totalObs = 0
        let cachedCount = 0
        let fetchedCount = 0

        const aggregateObservations = (data: any[]) => {
          for (const obs of data) {
            const code = obs.speciesCode
            const checklistId = `${obs.locId}_${obs.obsDt}`

            allChecklists.add(checklistId)

            if (!speciesChecklistMap[code]) {
              speciesChecklistMap[code] = new Set()
            }
            speciesChecklistMap[code].add(checklistId)

            speciesObsCount[code] = (speciesObsCount[code] || 0) + 1
            totalObs++

            if (!speciesMetadata[code]) {
              speciesMetadata[code] = {
                comName: obs.comName || code,
                sciName: obs.sciName || 'Unknown'
              }
            }
          }
        }

        // Process all dates
        for (const dateObj of datesToFetch) {
          const { year, month, day } = dateObj

          // Check cache first (unless force_refresh is set)
          if (!force_refresh && cache.isCached(region, year, month, day)) {
            const cachedData = cache.get(region, year, month, day)
            if (cachedData) {
              cachedCount++
              // Aggregate cached data
              aggregateObservations(cachedData)
              continue
            }
          }

          // Fetch from API if not cached
          await throttler.enqueue(async () => {
            try {
              const monthStr = String(month).padStart(2, '0')
              const dayStr = String(day).padStart(2, '0')
              const historicUrl = `${EBIRD_API_BASE}/data/obs/${region}/historic/${year}/${monthStr}/${dayStr}?maxResults=10000`

              const response = await fetch(historicUrl, {
                headers: { 'X-eBirdApiToken': api_key }
              })

              if (response.ok) {
                const data = await response.json()
                fetchedCount++

                // Cache the response
                cache.set(region, year, month, day, data)

                // Aggregate data
                aggregateObservations(data)

                // Log progress every 20 requests
                if ((cachedCount + fetchedCount) % 20 === 0) {
                  const progress = Math.round(
                    ((cachedCount + fetchedCount) / datesToFetch.length) * 100
                  )
                  console.log(
                    `Historic data progress: ${cachedCount + fetchedCount}/${datesToFetch.length} (${progress}%)`
                  )
                }
              } else {
                console.warn(
                  `Failed to fetch historic data for ${year}-${monthStr}-${dayStr}: ${response.status}`
                )
              }
            } catch (err) {
              console.error(
                `Error fetching historic data for ${year}-${month}-${day}:`,
                err
              )
            }
          })
        }

        console.log(
          `Historic data complete: ${cachedCount} cached, ${fetchedCount} fetched, ${totalObs} total observations, ${allChecklists.size} unique checklists`
        )

        // Build species array with both frequency metrics
        const totalChecklists = allChecklists.size
        const species = Object.entries(speciesObsCount)
          .map(([code, count]) => ({
            code,
            comName: speciesMetadata[code]?.comName || code,
            sciName: speciesMetadata[code]?.sciName || 'Unknown',
            checklistFrequency:
              totalChecklists > 0
                ? speciesChecklistMap[code].size / totalChecklists
                : 0,
            totalReports: count
          }))
          .sort((a, b) => b.checklistFrequency - a.checklistFrequency) // Sort by checklist frequency descending

        res.json({
          region,
          date_range: { start: start_date, end: end_date },
          years_back: 20,
          total_observations: totalObs,
          unique_species: species.length,
          species
        })
      } catch (err) {
        console.error('Error fetching historic observations:', err)
        res.status(500).json({
          error: 'Failed to fetch historic observations',
          details: err instanceof Error ? err.message : String(err)
        })
      }
    }
  )

  // Get target species for a region (legacy endpoint, redirects to historic)
  app.get('/api/ebird/targets/:region', async (req: Request, res: Response) => {
    const { region } = req.params
    const { api_key, start_date, end_date } = req.query as {
      api_key: string
      start_date?: string
      end_date?: string
    }

    if (!api_key) {
      return res.status(400).json({ error: 'API key required' })
    }

    try {
      console.log(`Fetching target species for region: ${region}`)
      console.log(`Start date: ${start_date}, End date: ${end_date}`)

      // Step 1: Get all species codes for the region
      const spplistUrl = `${EBIRD_API_BASE}/product/spplist/${region}`
      console.log(`Fetching spplist from: ${spplistUrl}`)

      const spplistResponse = await fetch(spplistUrl, {
        headers: { 'X-eBirdApiToken': api_key }
      })

      if (!spplistResponse.ok) {
        console.error(`spplist failed with status ${spplistResponse.status}`)
        return res
          .status(spplistResponse.status)
          .json({ error: 'Failed to fetch species list' })
      }

      const speciesCodes = await spplistResponse.json()
      console.log(`Found ${speciesCodes.length} species codes`)

      // Step 2: Get recent observations to calculate frequency
      // Fetch recent observations to get species data
      const obsUrl = `${EBIRD_API_BASE}/data/obs/${region}/recent?maxResults=10000`
      console.log(`Fetching observations from: ${obsUrl}`)

      const obsResponse = await fetch(obsUrl, {
        headers: { 'X-eBirdApiToken': api_key }
      })

      let observations: any[] = []
      let speciesObsCount: Record<string, number> = {}

      if (obsResponse.ok) {
        observations = await obsResponse.json()
        console.log(`Received ${observations.length} recent observations`)

        // Count observations per species
        // Note: We calculate frequency based on all recent observations
        // When the trip dates are in the future, we use current seasonal patterns
        // as the best indicator of what will be visible
        let totalObs = 0
        for (const obs of observations) {
          const code = obs.speciesCode
          speciesObsCount[code] = (speciesObsCount[code] || 0) + 1
          totalObs++
        }

        console.log(
          `Processed ${totalObs} observations, found ${Object.keys(speciesObsCount).length} unique species`
        )

        // Step 3: Build species data with frequency
        const species = speciesCodes
          .filter((code: string) => speciesObsCount[code]) // Only include species with observations
          .map((code: string) => ({
            code,
            comName: code, // Will be enriched from observation data below
            sciName: 'Unknown',
            frequency: totalObs > 0 ? speciesObsCount[code] / totalObs : 0
          }))

        console.log(`Built ${species.length} species records`)

        // Enrich with names from observations
        const speciesMap = new Map<string, any>()
        for (const obs of observations) {
          if (!speciesMap.has(obs.speciesCode)) {
            speciesMap.set(obs.speciesCode, {
              comName: obs.comName || obs.speciesCode,
              sciName: obs.sciName || 'Unknown'
            })
          }
        }

        const enrichedSpecies = species.map((s: any) => {
          const data = speciesMap.get(s.code)
          return {
            ...s,
            comName: data?.comName || s.code,
            sciName: data?.sciName || 'Unknown'
          }
        })

        console.log(
          `Returning ${enrichedSpecies.length} species with frequency data`
        )
        res.json(enrichedSpecies)
      } else {
        console.error(
          `Observations fetch failed with status ${obsResponse.status}`
        )
        res.status(500).json({ error: 'Failed to fetch observation data' })
      }
    } catch (err) {
      console.error('Error fetching targets:', err)
      res.status(500).json({
        error: 'Failed to fetch target species',
        details: err instanceof Error ? err.message : String(err)
      })
    }
  })

  // Get recent observations for a species in a region
  app.get(
    '/api/ebird/observations/:region/:species',
    async (req: Request, res: Response) => {
      const { region, species } = req.params
      const { api_key, back = '30' } = req.query as {
        api_key: string
        back?: string
      }

      if (!api_key) {
        return res.status(400).json({ error: 'API key required' })
      }

      try {
        const response = await fetch(
          `${EBIRD_API_BASE}/data/obs/${region}/recent?sppCode=${species}&back=${back}`,
          { headers: { 'X-eBirdApiToken': api_key } }
        )
        if (!response.ok) {
          return res
            .status(response.status)
            .json({ error: 'Failed to fetch observations' })
        }
        const data = await response.json()
        res.json(data)
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch observations' })
      }
    }
  )

  // Get hotspots in a region
  app.get(
    '/api/ebird/hotspots/:region',
    async (req: Request, res: Response) => {
      const { region } = req.params
      const { api_key } = req.query as { api_key: string }

      if (!api_key) {
        return res.status(400).json({ error: 'API key required' })
      }

      try {
        const url = `${EBIRD_API_BASE}/ref/hotspot/${region}`
        console.log(`Fetching hotspots from: ${url}`)
        const response = await fetch(url, {
          headers: { 'X-eBirdApiToken': api_key }
        })
        if (!response.ok) {
          console.warn(
            `Hotspots API returned ${response.status}: ${response.statusText}`
          )
          return res
            .status(response.status)
            .json({ error: 'Failed to fetch hotspots' })
        }
        try {
          const data = await response.json()
          res.json(data)
        } catch (parseErr) {
          console.warn(
            'Hotspots API returned non-JSON response:',
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          )
          res.json([]) // Return empty array for malformed responses
        }
      } catch (err) {
        console.error('Error fetching hotspots:', err)
        res.status(500).json({
          error: 'Failed to fetch hotspots',
          details: err instanceof Error ? err.message : String(err)
        })
      }
    }
  )

  // Trip routes
  app.get('/api/trips', authMiddleware, (req: Request, res: Response) => {
    const trips = getUserTrips(req.userId!)
    res.json(trips)
  })

  app.get('/api/trips/:id', authMiddleware, (req: Request, res: Response) => {
    const trip = getTripById(parseInt(req.params.id), req.userId!)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }
    res.json(trip)
  })

  app.post(
    '/api/trips',
    authMiddleware,
    async (req: Request, res: Response) => {
      const { name, location, latitude, longitude, start_date, end_date } =
        req.body as CreateTripRequest

      if (!name || !location || !start_date || !end_date) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      try {
        const trip = createTrip(
          req.userId!,
          name,
          location,
          start_date,
          end_date,
          latitude,
          longitude
        )
        res.status(201).json(trip)
      } catch (err) {
        res.status(500).json({ error: 'Failed to create trip' })
      }
    }
  )

  app.put('/api/trips/:id', authMiddleware, (req: Request, res: Response) => {
    const trip = getTripById(parseInt(req.params.id), req.userId!)
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' })
    }

    try {
      const updated = updateTrip(parseInt(req.params.id), req.userId!, req.body)
      res.json(updated)
    } catch (err) {
      console.error('Error updating trip:', err)
      res.status(500).json({
        error: 'Failed to update trip',
        details: err instanceof Error ? err.message : String(err)
      })
    }
  })

  app.delete(
    '/api/trips/:id',
    authMiddleware,
    (req: Request, res: Response) => {
      const success = deleteTrip(parseInt(req.params.id), req.userId!)
      if (!success) {
        return res.status(404).json({ error: 'Trip not found' })
      }
      res.status(204).send()
    }
  )

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  return app
}

// Extend Express Request type to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: number
    }
  }
}
