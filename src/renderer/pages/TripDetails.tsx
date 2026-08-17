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
  DialogActions
} from '@mui/material'
import { ArrowBack, Refresh, Edit } from '@mui/icons-material'

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
  hotspots: Array<{ name: string; lat: number; lng: number }>
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
  const [activeTab, setActiveTab] = useState<'species' | 'map'>('species')
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

  // Initialize edit form with trip data
  useEffect(() => {
    setEditName(trip.name)
    setEditStartDate(trip.start_date.split('T')[0])
    setEditEndDate(trip.end_date.split('T')[0])
  }, [trip.id, trip.name, trip.start_date, trip.end_date])

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
          // Fetch hotspots for the region (optional)
          fetch(
            `http://localhost:3000/api/ebird/hotspots/${trip.location}?api_key=${encodeURIComponent(ebirdApiKey)}`
          )
            .then((hotspotsResponse) => {
              if (hotspotsResponse.ok) {
                return hotspotsResponse.json()
              }
              return []
            })
            .catch((hotspotsErr) => {
              console.warn(
                'Failed to fetch hotspots (non-blocking):',
                hotspotsErr
              )
              return []
            })
            .then((hotspots) => {
              // Transform species data with frequency and hotspots
              const speciesWithData: SpeciesData[] = species.map((s: any) => ({
                code: s.code || '',
                common_name: s.comName || 'Unknown',
                scientific_name: s.sciName || 'Unknown',
                checklistFrequency: Math.round(
                  (s.checklistFrequency || 0) * 100
                ),
                totalReports: s.totalReports || 0,
                hotspots: hotspots.slice(0, 3).map((h: any) => ({
                  name: h.locName || h.name,
                  lat: h.lat,
                  lng: h.lng
                }))
              }))

              setSpecies(speciesWithData)
              setHasLoaded(true)
              setLoading(false)
              setProgress(null)
              console.log(`✨ Display ready: ${speciesWithData.length} species`)
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

  return (
    <Container maxWidth='lg' sx={{ py: 3 }}>
      {/* Back Button */}
      <Button
        startIcon={<ArrowBack />}
        onClick={onBack}
        sx={{
          mb: 3,
          textTransform: 'none',
          fontSize: '0.9375rem',
          boxShadow: 'none'
        }}
      >
        Back to Trips
      </Button>

      {/* Trip Header */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
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
        <Button
          fullWidth
          size='large'
          variant='contained'
          onClick={() => loadSpecies(false)}
          disabled={loading}
          sx={{ mb: 3, boxShadow: 'none' }}
        >
          {loading ? 'Loading Species...' : 'Load Target Species'}
        </Button>
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
        <Box sx={{ mt: 3, backgroundColor: 'transparent' }}>
          <Tabs
            value={activeTab === 'species' ? 0 : 1}
            onChange={(e, newValue) =>
              setActiveTab(newValue === 0 ? 'species' : 'map')
            }
            sx={{ backgroundColor: 'transparent' }}
          >
            <Tab label={`Target Species (${species.length})`} />
            <Tab label='Map' />
          </Tabs>

          {activeTab === 'species' && (
            <Box sx={{ p: 3, backgroundColor: 'transparent' }}>
              <Typography variant='body2' sx={{ color: '#64748b', mb: 2 }}>
                These are species likely to be found in {trip.location} during
                your trip dates.
              </Typography>

              <Table sx={{ mt: 2, backgroundColor: 'transparent' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      Common Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                      Scientific Name
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
                      Best Hotspots
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {species.map((s) => (
                    <TableRow
                      key={s.code}
                      sx={{
                        '&:hover': { backgroundColor: '#f9fafb' },
                        '&:last-child td, &:last-child th': { border: 0 }
                      }}
                    >
                      <TableCell sx={{ fontWeight: 500 }}>
                        {s.common_name}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: '#64748b',
                          fontStyle: 'italic',
                          fontSize: '0.875rem'
                        }}
                      >
                        {s.scientific_name}
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
                        {s.hotspots.length > 0 ? (
                          <Stack spacing={0.5}>
                            {s.hotspots.map((hs, idx: number) => (
                              <Box key={idx}>
                                <Typography
                                  variant='body2'
                                  sx={{ fontWeight: 500 }}
                                >
                                  {hs.name}
                                </Typography>
                                <Typography
                                  variant='caption'
                                  sx={{ color: '#94a3b8' }}
                                >
                                  ({hs.lat.toFixed(2)}°, {hs.lng.toFixed(2)}°)
                                </Typography>
                              </Box>
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant='body2' sx={{ color: '#94a3b8' }}>
                            No hotspots available
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
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
