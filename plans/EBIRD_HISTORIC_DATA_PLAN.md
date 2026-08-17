# eBird Historic Data Implementation Plan

## Overview

Replace the "Load Target Species" feature with a proper historic data-based approach that fetches 20 years of observation history for the trip dates and intelligently caches the results.

## Objective

- Fetch 20 years of observation history for exact trip dates
- Cache data locally (both browser + disk) to never re-request the same date
- Calculate species frequency from actual historic sightings
- Later cross-reference with user's life list to show unseen species only

## eBird API Endpoint

```
GET https://api.ebird.org/v2/data/obs/{regionCode}/historic/{YYYY}/{MM}/{DD}
```

### Endpoint Details

- **Parameters**: region, year, month, day
- **Query params**: cat, details (simple/full), hotspot (t/f), includeProvisional (t/f), maxResults (1-10000), rank (mrec/create)
- **Response**: Array of observations with: speciesCode, comName, sciName, locName, obsDt, etc.

## Implementation Decisions

| Aspect                    | Decision                                         | Rationale                                  |
| ------------------------- | ------------------------------------------------ | ------------------------------------------ |
| **Cache Strategy**        | Dual: localStorage + Node disk cache             | Speed + persistence across sessions        |
| **Date Range**            | Exact trip dates (9 days × 20 years = 180 calls) | User specified; ~3 min at 1 req/sec        |
| **Request Throttling**    | 1 request per second                             | Avoid API rate limiting / blocking         |
| **UI Location**           | Modal in TripDetails.tsx                         | Non-intrusive, shows in context            |
| **Frequency Calculation** | (sightings of species) / (total sightings)       | Simple, intuitive metric                   |
| **Cache Invalidation**    | Manual via "Force Refresh" button                | Data doesn't change; user controls updates |

## Expected Duration

- **180 API calls** at 1/second = ~3 minutes
- Show progress as "Fetching historic data: 45/180 (25%)"

## Architecture

### 1. Caching Layer (Node)

**File**: `src/main/cache.ts` (NEW)

```typescript
import fs from 'fs'
import path from 'path'

// Cache structure: ~/.ebird-cache/{region}/{YYYY}/{MM}/{DD}.json
class HistoricDataCache {
  getCacheDir(region: string): string
  getCachePath(region: string, year: number, month: number, day: number): string
  get(region: string, year: number, month: number, day: number): any[] | null
  set(
    region: string,
    year: number,
    month: number,
    day: number,
    data: any[]
  ): void
  clear(region?: string): void
}
```

### 2. Throttled Request Handler (Node)

**File**: `src/main/server.ts` (UPDATE `/api/ebird/historic`)

```typescript
// Queue-based throttler: 1 request per second
class ThrottledRequester {
  queue: (() => Promise<any>)[] = []
  processing = false
  requestsPerSecond = 1

  enqueue(fn: () => Promise<any>): Promise<any>
  // Process queue, waiting 1 second between requests
}

// New endpoint: GET /api/ebird/historic/{region}?api_key=X&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
app.get('/api/ebird/historic/:region', async (req, res) => {
  // 1. Parse dates, extract year/month/day ranges
  // 2. Check disk cache for each date
  // 3. Queue missing dates for API requests
  // 4. Process queue with 1 req/sec throttle
  // 5. Aggregate all observations
  // 6. Calculate frequency: count(species) / total(observations)
  // 7. Return array of species with frequency
})
```

### 3. Frontend Updates (React)

**File**: `src/renderer/pages/TripDetails.tsx` (UPDATE)

New state:

```typescript
const [loading, setLoading] = useState(false)
const [progress, setProgress] = useState<{
  current: number
  total: number
} | null>(null)
const [estimatedSeconds, setEstimatedSeconds] = useState(0)
```

Update `loadSpecies()`:

- Calculate total expected API calls (9 days × 20 years)
- Set `estimatedSeconds` = calls remaining
- Call `/api/ebird/historic/{region}`
- Listen for progress updates via WebSocket or polling
- Show modal with "Fetching historic data: {current}/{total} ({percent}%) - ~{timeRemaining}s"

### 4. Storage Structure

```
~/.ebird-cache/
├── SG/                          # Region code
│   ├── 2006/
│   │   ├── 09/
│   │   │   ├── 25.json         # Sept 25 observations
│   │   │   ├── 26.json
│   │   │   └── ...
│   │   └── 10/
│   │       ├── 01.json
│   │       └── ...
│   ├── 2007/
│   └── ...
└── NZ/                          # Another region
    └── ...
```

Each file: `[{speciesCode, comName, sciName, locName, obsDt, ...}, ...]`

## Implementation Steps

### Phase 1: Backend Infrastructure

1. Create `src/main/cache.ts` with HistoricDataCache class
2. Create throttled request handler in `src/main/server.ts`
3. Implement `/api/ebird/historic/{region}` endpoint
4. Test with one date to verify data structure

### Phase 2: Frontend

1. Add progress state to TripDetails.tsx
2. Create LoadingModal component
3. Update loadSpecies() to call new endpoint
4. Implement progress reporting (WebSocket/polling)
5. Display frequency data in table

### Phase 3: Testing & Optimization

1. Test with actual trip dates (9 days)
2. Verify cache is persisted
3. Test cache hit (should be instant)
4. Monitor for API errors
5. Optimize data structure if needed

### Phase 4: Future Work

1. Implement `/settings/life-list` page for user to input seen species
2. Filter historic species against life list
3. Show only unseen species with "New for you" badge
4. Export trip species list as PDF/CSV

## Error Handling

### API Errors

- **401**: Invalid API key → Show error in modal
- **429**: Rate limited → Increase throttle delay
- **404**: Invalid region → Show error
- **500**: Server error → Retry up to 3 times

### Network Errors

- Partial data loss → Cache what we have, allow user to retry
- Allow "Resume" on subsequent clicks

### Disk Cache Errors

- Can't create ~/.ebird-cache → Fall through to memory only
- Corrupt cache file → Delete and re-fetch

## Performance Considerations

- **Memory**: 180 requests × ~50 species per day = ~9000 species observations
- **Disk**: ~180 × 10KB per day = ~1.8MB per region
- **Network**: 180 × 1 sec = 180 seconds minimum (3 minutes)
- **Browser localStorage**: ~5MB limit (plenty for compressed data)

## Data Validation

- Ensure each historic response contains species array
- Validate speciesCode, comName, sciName presence
- Filter out duplicates when aggregating

## API Rate Limiting Notes

- eBird API doesn't publish explicit limits, just "don't adversely impact servers"
- 1 request/second is conservative; could likely go faster but better safe
- Consider backing off if receiving 429 (Too Many Requests) responses

## Future Enhancements

1. **Parallel requests**: If we find limits are higher, use worker pool (5-10 concurrent)
2. **Seasonal weighting**: Weight older years less than recent years
3. **Confidence scoring**: Show reliability of frequency estimates
4. **Historical trends**: Show which species are increasing/decreasing in region
5. **Predictive alerts**: "This species is rare this year, good spotting chance!"
