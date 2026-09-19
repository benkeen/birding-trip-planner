import { useState, useEffect } from 'react'
import type { Trip } from '@shared/types'
import {
  Box,
  Button,
  Typography,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Alert,
  CircularProgress,
  LinearProgress,
  Container,
  Chip,
  Stack,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  DialogActions,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Link
} from '@mui/material'
import { ArrowBack, Refresh, Edit, CheckCircle } from '@mui/icons-material'

interface TripDetailsProps {
  trip: Trip
  token: string
  ebirdApiKey: string
  onBack: () => void
}

interface SpeciesData {
  code: string
  common_name: string
  scientific_name: string
  checklistFrequency: number // 0-1 (percentage of checklists)
  totalReports: number // total observations
  locations: Array<{ name: string; lat: number; lng: number; count: number }>
}

function formatDateRange(startDate: string, endDate: string): string {
  // Parse as local date, not UTC
  const parseLocalDate = (dateStr: string) => {
    const datePart = dateStr.split('T')[0]
    const [year, month, day] = datePart.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sept',
    'Oct',
    'Nov',
    'Dec'
  ]

  const getDaySuffix = (day: number) => {
    if (day > 3 && day < 21) return 'th'
    switch (day % 10) {
      case 1:
        return 'st'
      case 2:
        return 'nd'
      case 3:
        return 'rd'
      default:
        return 'th'
    }
  }

  const startMonth = monthNames[start.getMonth()]
  const startDay = start.getDate()
  const endMonth = monthNames[end.getMonth()]
  const endDay = end.getDate()
  const endYear = end.getFullYear()

  return `${startMonth} ${startDay}${getDaySuffix(startDay)} - ${endMonth} ${endDay}${getDaySuffix(endDay)} ${endYear}`
}

export default function TripDetails({
  trip,
  token,
  ebirdApiKey,
  onBack
}: TripDetailsProps) {
  const [loading, setLoading] = useState(false)
  const [species, setSpecies] = useState<SpeciesData[]>([])
  const [error, setError] = useState('')
  const [hasLoaded, setHasLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<'species' | 'locations' | 'map'>(
    'species'
  )
  const [progress, setProgress] = useState<{
    current: number
    total: number
    estimatedSeconds: number
  } | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [lifersOnly, setLifersOnly] = useState(false)
  const [timespanYears, setTimespanYears] = useState(20)
  const [timespanLoading, setTimespanLoading] = useState(false)
  const [seenScientificNames, setSeenScientificNames] = useState<Set<string>>(
    new Set()
  )

  // Initialize edit form with trip data
  useEffect(() => {
    setEditName(trip.name)
    setEditStartDate(trip.start_date.split('T')[0])
    setEditEndDate(trip.end_date.split('T')[0])
  }, [trip.id, trip.name, trip.start_date, trip.end_date])

  // Load any previously persisted target species so returning to this page
  // doesn't require re-requesting the data
  useEffect(() => {
    let cancelled = false

    const loadCachedSpecies = async () => {
      try {
        const response = await fetch(
          `http://localhost:3000/api/trips/${trip.id}/species`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (!response.ok) return

        const data = await response.json()
        if (
          !cancelled &&
          Array.isArray(data.species) &&
          data.species.length > 0
        ) {
          // Normalize older cached entries that predate the `locations` field
          const normalized: SpeciesData[] = data.species.map((s: any) => ({
            code: s.code || '',
            common_name: s.common_name || 'Unknown',
            scientific_name: s.scientific_name || 'Unknown',
            checklistFrequency: s.checklistFrequency || 0,
            totalReports: s.totalReports || 0,
            locations: Array.isArray(s.locations) ? s.locations : []
          }))
          setSpecies(normalized)
          setHasLoaded(true)
        }
      } catch (err) {
        console.warn('Failed to load cached target species:', err)
      }
    }

    loadCachedSpecies()

    return () => {
      cancelled = true
    }
  }, [trip.id, token])

  // Load the user's life list to cross-reference which species have been seen
  useEffect(() => {
    let cancelled = false

    const loadLifeList = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/life-list', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!response.ok) return

        const data = await response.json()
        if (!cancelled && Array.isArray(data.species)) {
          const seen = new Set<string>(
            data.species
              .map((s: { scientific_name?: string }) =>
                (s.scientific_name || '').trim().toLowerCase()
              )
              .filter((name: string) => name.length > 0)
          )
          setSeenScientificNames(seen)
        }
      } catch (err) {
        console.warn('Failed to load life list for cross-reference:', err)
      }
    }

    loadLifeList()

    return () => {
      cancelled = true
    }
  }, [token])

  const handleSaveTrip = async () => {
    setEditError('')

    // Validate dates
    if (editStartDate >= editEndDate) {
      setEditError('End date must be after start date')
      return
    }

    if (!editName.trim()) {
      setEditError('Trip name is required')
      return
    }

    setEditSaving(true)
    try {
      const response = await fetch(
        `http://localhost:3000/api/trips/${trip.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: editName,
            start_date: `${editStartDate}T00:00:00`,
            end_date: `${editEndDate}T00:00:00`
          })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('Server error response:', errorData)
        throw new Error(
          errorData.details || errorData.error || 'Failed to update trip'
        )
      }

      // Refresh the page or update trip state
      window.location.reload()
    } catch (err) {
      console.error('Failed to save trip:', err)
      setEditError(
        err instanceof Error ? err.message : 'Failed to save trip details'
      )
    } finally {
      setEditSaving(false)
    }
  }

  const loadSpecies = async (forceRefresh = false) => {
    console.log(`🚀 Loading species: forceRefresh=${forceRefresh}`)

    if (!ebirdApiKey) {
      setError('eBird API key is required. Please set it in Settings.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Extract just the date part (YYYY-MM-DD) from ISO strings
      const startDateStr = trip.start_date.split('T')[0]
      const endDateStr = trip.end_date.split('T')[0]

      // Step 1: Start the fetch in the backend
      const startResponse = await fetch(
        `http://localhost:3000/api/ebird/historic-start/${trip.location}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: ebirdApiKey,
            start_date: startDateStr,
            end_date: endDateStr,
            force_refresh: forceRefresh
          })
        }
      )

      if (!startResponse.ok) {
        throw new Error(
          `Failed to start historic data fetch: ${startResponse.status}`
        )
      }

      const { sessionId } = await startResponse.json()
      console.log(`✅ Started background fetch with session: ${sessionId}`)

      // Step 2: Poll for progress
      let done = false
      let species: any[] = []
      let errorMsg = ''

      setProgress({ current: 0, total: 0, estimatedSeconds: 0 })

      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch(
            `http://localhost:3000/api/ebird/historic-progress/${sessionId}`
          )

          if (!progressResponse.ok) {
            throw new Error(
              `Failed to fetch progress: ${progressResponse.status}`
            )
          }

          const state = await progressResponse.json()
          console.log(`📊 Progress: ${state.current}/${state.total}`)

          setProgress({
            current: state.current,
            total: state.total,
            estimatedSeconds: state.estimatedSeconds || 0
          })

          if (state.done) {
            clearInterval(pollInterval)
            done = true

            if (state.error) {
              console.error('❌ Backend error:', state.error)
              errorMsg = state.error
              setLoading(false)
              setError(errorMsg)
              return
            }

            species = state.species || []
            console.log(`✨ Fetch complete: ${species.length} unique species`)
          }
        } catch (pollErr) {
          console.error('❌ Failed to poll progress:', pollErr)
          clearInterval(pollInterval)
          setError('Failed to fetch progress updates')
          setLoading(false)
        }

        if (done && species.length > 0) {
          // Build display data using the per-species locations from observations
          const speciesWithData: SpeciesData[] = species.map((s: any) => ({
            code: s.code || '',
            common_name: s.comName || 'Unknown',
            scientific_name: s.sciName || 'Unknown',
            checklistFrequency: Math.round((s.checklistFrequency || 0) * 100),
            totalReports: s.totalReports || 0,
            locations: Array.isArray(s.locations) ? s.locations : []
          }))

          setSpecies(speciesWithData)
          setHasLoaded(true)
          setLoading(false)
          setProgress(null)
          console.log(`✨ Display ready: ${speciesWithData.length} species`)

          // Persist so returning to this page doesn't require re-requesting
          fetch(`http://localhost:3000/api/trips/${trip.id}/species`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ species: speciesWithData })
          }).catch((saveErr) => {
            console.warn('Failed to persist target species:', saveErr)
          })
        }
      }, 500) // Poll every 500ms
    } catch (err) {
      console.error('❌ Failed to load species:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to load species data'
      )
      setLoading(false)
    }
  }

  // Open the eBird species page in the user's default browser
  const openSpeciesPage = (code: string) => {
    if (!code) return
    const url = `https://ebird.org/species/${code}`
    const electron = (window as any).electron
    if (electron?.ipcRenderer?.invoke) {
      electron.ipcRenderer
        .invoke('open-external', url)
        .catch((err: unknown) => {
          console.error('Failed to open species page:', err)
        })
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  // Re-aggregate the cached observations for a chosen number of years
  const applyTimespan = async (years: number) => {
    setTimespanYears(years)
    setTimespanLoading(true)
    try {
      const startDateStr = trip.start_date.split('T')[0]
      const endDateStr = trip.end_date.split('T')[0]
      const response = await fetch(
        `http://localhost:3000/api/ebird/aggregate/${trip.location}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            start_date: startDateStr,
            end_date: endDateStr,
            years
          })
        }
      )
      if (!response.ok) {
        throw new Error(`Failed to aggregate timespan: ${response.status}`)
      }
      const data = await response.json()
      const mapped: SpeciesData[] = (data.species || []).map((s: any) => ({
        code: s.code || '',
        common_name: s.comName || 'Unknown',
        scientific_name: s.sciName || 'Unknown',
        checklistFrequency: Math.round((s.checklistFrequency || 0) * 100),
        totalReports: s.totalReports || 0,
        locations: Array.isArray(s.locations) ? s.locations : []
      }))
      setSpecies(mapped)
    } catch (err) {
      console.error('Failed to apply timespan:', err)
    } finally {
      setTimespanLoading(false)
    }
  }

  const filteredSpecies = species.filter((s) => {
    if (
      lifersOnly &&
      seenScientificNames.has(s.scientific_name.trim().toLowerCase())
    ) {
      return false
    }
    const q = searchFilter.trim().toLowerCase()
    if (!q) return true
    return (
      s.common_name.toLowerCase().includes(q) ||
      s.scientific_name.toLowerCase().includes(q)
    )
  })

  const uniqueLocationCount = new Set(
    filteredSpecies.flatMap((s) =>
      s.locations.map((l) => `${l.name}|${l.lat}|${l.lng}`)
    )
  ).size

  return (
    <Container
      maxWidth='lg'
      sx={{
        py: 3,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}
    >
      {/* Trip Header */}
      <Box
        sx={{
          mb: 3,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <IconButton
            size='small'
            onClick={onBack}
            sx={{ mr: 0.5 }}
            title='Back to Trips'
          >
            <ArrowBack sx={{ fontSize: '1.25rem' }} />
          </IconButton>
          <Typography variant='h4' sx={{ fontWeight: 600 }}>
            {trip.name}
          </Typography>
          <Typography variant='body2' sx={{ color: '#94a3b8' }}>
            {formatDateRange(trip.start_date, trip.end_date)}
          </Typography>
          <IconButton
            size='small'
            onClick={() => setEditMode(true)}
            sx={{ ml: 1 }}
            title='Edit trip details'
          >
            <Edit sx={{ fontSize: '1.25rem' }} />
          </IconButton>
        </Box>
        {hasLoaded && species.length > 0 && (
          <Button
            size='small'
            startIcon={<Refresh />}
            onClick={() => loadSpecies(true)}
            disabled={loading}
            sx={{ textTransform: 'none', flexShrink: 0, boxShadow: 'none' }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        )}
      </Box>

      {/* Edit Trip Dialog */}
      <Dialog
        open={editMode}
        onClose={() => setEditMode(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle sx={{ fontSize: '1.1rem', pb: 1 }}>
          Edit Trip Details
        </DialogTitle>
        <DialogContent
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            paddingTop: '10px !important'
          }}
        >
          {editError && (
            <Alert severity='error' sx={{ fontSize: '0.85rem' }}>
              {editError}
            </Alert>
          )}
          <TextField
            label='Trip Name'
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            fullWidth
            size='small'
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.9rem' } }}
          />
          <TextField
            label='Start Date'
            type='date'
            value={editStartDate}
            onChange={(e) => setEditStartDate(e.target.value)}
            fullWidth
            size='small'
            InputLabelProps={{ shrink: true }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.9rem' } }}
          />
          <TextField
            label='End Date'
            type='date'
            value={editEndDate}
            onChange={(e) => setEditEndDate(e.target.value)}
            fullWidth
            size='small'
            InputLabelProps={{ shrink: true }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.9rem' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditMode(false)}
            sx={{
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none' }
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSaveTrip()}
            variant='contained'
            disabled={editSaving}
            sx={{
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none' }
            }}
          >
            {editSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Load Button */}
      {!hasLoaded && (
        <Box sx={{ mb: 3 }}>
          <Button
            size='medium'
            variant='contained'
            onClick={() => loadSpecies(false)}
            disabled={loading}
          >
            {loading ? 'Loading Species...' : 'Load Target Species'}
          </Button>
        </Box>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity='error' sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Progress Modal */}
      <Dialog open={loading && progress !== null} maxWidth='sm' fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Fetching Historic Species Data</DialogTitle>
        <DialogContent sx={{ py: 3 }}>
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}
            >
              <Typography variant='body2'>
                {progress
                  ? `Fetching: ${progress.current} / ${progress.total} dates`
                  : 'Starting...'}
              </Typography>
              <Typography variant='body2' sx={{ fontWeight: 600 }}>
                {progress
                  ? `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`
                  : '0%'}
              </Typography>
            </Box>
            <LinearProgress
              variant='determinate'
              value={
                progress
                  ? Math.min(
                      100,
                      Math.round((progress.current / progress.total) * 100)
                    )
                  : 0
              }
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
          <Typography variant='caption' sx={{ color: '#94a3b8' }}>
            {progress
              ? `Estimated time remaining: ~${Math.max(0, progress.estimatedSeconds - Math.round((progress.current / progress.total) * progress.estimatedSeconds))}s`
              : 'Please wait...'}
          </Typography>
          <Typography
            variant='caption'
            sx={{ color: '#94a3b8', display: 'block', mt: 2 }}
          >
            (Fetching 20 years of historic observations)
          </Typography>
        </DialogContent>
      </Dialog>

      {/* Loading State (for other loading scenarios) */}
      {loading && progress === null && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Species Data with Tabs */}
      {hasLoaded && species.length > 0 && (
        <Box
          sx={{
            mt: 0.5,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'transparent'
          }}
        >
          {/* Search + filters (above the tabs) */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 1.5,
              flexShrink: 0
            }}
          >
            <TextField
              placeholder='Search species…'
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              size='small'
              fullWidth
              sx={{
                maxWidth: 280,
                '& .MuiInputBase-input': {
                  fontSize: '0.8rem',
                  py: 0.75
                }
              }}
            />
            <TextField
              select
              label='Timespan'
              value={timespanYears}
              onChange={(e) => applyTimespan(Number(e.target.value))}
              size='small'
              disabled={timespanLoading}
              sx={{
                minWidth: 150,
                flexShrink: 0,
                '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.75 },
                '& .MuiInputLabel-root': { fontSize: '0.8rem' }
              }}
            >
              <MenuItem value={1}>Last 1 year</MenuItem>
              <MenuItem value={2}>Last 2 years</MenuItem>
              <MenuItem value={3}>Last 3 years</MenuItem>
              <MenuItem value={5}>Last 5 years</MenuItem>
              <MenuItem value={10}>Last 10 years</MenuItem>
              <MenuItem value={20}>Last 20 years</MenuItem>
            </TextField>
            <FormControlLabel
              control={
                <Checkbox
                  checked={lifersOnly}
                  onChange={(e) => setLifersOnly(e.target.checked)}
                  size='small'
                  sx={{
                    p: 0.5,
                    '& .MuiSvgIcon-root': { fontSize: '1rem' }
                  }}
                />
              }
              label='Lifers only'
              sx={{
                flexShrink: 0,
                whiteSpace: 'nowrap',
                '& .MuiFormControlLabel-label': { fontSize: '0.75rem' }
              }}
            />
          </Box>

          <Tabs
            value={
              activeTab === 'species' ? 0 : activeTab === 'locations' ? 1 : 2
            }
            onChange={(e, newValue) =>
              setActiveTab(
                newValue === 0
                  ? 'species'
                  : newValue === 1
                    ? 'locations'
                    : 'map'
              )
            }
            sx={{ flexShrink: 0, backgroundColor: 'transparent' }}
          >
            <Tab label={`Species (${filteredSpecies.length})`} />
            <Tab label={`Locations (${uniqueLocationCount})`} />
            <Tab label='Map' />
          </Tabs>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {activeTab === 'species' && (
              <Box sx={{ p: 3, pl: 0, backgroundColor: 'transparent' }}>
                <Table sx={{ mt: 2, backgroundColor: 'transparent' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        Species
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          textAlign: 'center'
                        }}
                      >
                        Seen
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          textAlign: 'center'
                        }}
                      >
                        Checklist Frequency
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          textAlign: 'center'
                        }}
                      >
                        Total Reports
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        Locations
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSpecies.map((s) => {
                      const seen = seenScientificNames.has(
                        s.scientific_name.trim().toLowerCase()
                      )
                      return (
                        <TableRow
                          key={s.code}
                          sx={{
                            '&:hover': { backgroundColor: '#f9fafb' },
                            '&:last-child td, &:last-child th': { border: 0 }
                          }}
                        >
                          <TableCell>
                            <Link
                              component='button'
                              type='button'
                              onClick={() => openSpeciesPage(s.code)}
                              underline='hover'
                              sx={{
                                display: 'block',
                                textAlign: 'left',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: '#2563eb',
                                cursor: 'pointer'
                              }}
                            >
                              {s.common_name}
                            </Link>
                            <Typography
                              variant='caption'
                              sx={{ color: '#64748b', fontStyle: 'italic' }}
                            >
                              {s.scientific_name}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            {seen ? (
                              <CheckCircle
                                sx={{ color: '#16a34a', fontSize: '1.25rem' }}
                                titleAccess='Seen'
                              />
                            ) : (
                              <Typography
                                variant='body2'
                                sx={{ color: '#cbd5e1' }}
                              >
                                —
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            <Chip
                              label={`${s.checklistFrequency}%`}
                              variant='outlined'
                              size='small'
                              sx={{
                                backgroundColor: '#e2e8f0',
                                color: '#475569',
                                border: 'none',
                                fontWeight: 500,
                                fontSize: '0.75rem'
                              }}
                            />
                          </TableCell>
                          <TableCell
                            sx={{ textAlign: 'center', fontSize: '0.875rem' }}
                          >
                            {s.totalReports}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>
                            {s.locations && s.locations.length > 0 ? (
                              <Stack
                                spacing={0.5}
                                sx={{
                                  maxHeight: 160,
                                  overflowY: 'auto',
                                  pr: 1
                                }}
                              >
                                {s.locations.map((loc, idx: number) => (
                                  <Box key={idx}>
                                    <Typography
                                      variant='body2'
                                      sx={{ fontWeight: 500 }}
                                    >
                                      {loc.name}{' '}
                                      <Typography
                                        component='span'
                                        variant='caption'
                                        sx={{ color: '#64748b' }}
                                      >
                                        ({loc.count})
                                      </Typography>
                                    </Typography>
                                  </Box>
                                ))}
                              </Stack>
                            ) : (
                              <Typography
                                variant='body2'
                                sx={{ color: '#94a3b8' }}
                              >
                                No locations available
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}

            {activeTab === 'locations' && (
              <Box sx={{ p: 3, pl: 0, backgroundColor: 'transparent' }} />
            )}

            {activeTab === 'map' && (
              <Box
                sx={{
                  p: 6,
                  textAlign: 'center',
                  color: '#94a3b8',
                  minHeight: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'transparent'
                }}
              >
                <Typography>Map view coming soon</Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Empty State */}
      {hasLoaded && species.length === 0 && (
        <Box
          sx={{
            p: 4,
            textAlign: 'center',
            mt: 3,
            backgroundColor: 'transparent'
          }}
        >
          <Typography sx={{ color: '#64748b', mb: 2 }}>
            No species data available for this trip yet.
          </Typography>
          <Button
            variant='outlined'
            size='small'
            onClick={() => loadSpecies(true)}
            disabled={loading}
            sx={{ boxShadow: 'none' }}
          >
            {loading ? 'Refreshing...' : 'Try Again'}
          </Button>
        </Box>
      )}
    </Container>
  )
}
