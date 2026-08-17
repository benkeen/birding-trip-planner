import type { Trip } from '@shared/types'
import './TripsList.css'

interface TripsListProps {
  trips: Trip[]
  loading: boolean
  hasApiKey: boolean
  onSelectTrip: (trip: Trip) => void
  onDeleteTrip: (tripId: number) => void
  onGoToSettings: () => void
}

export default function TripsList({
  trips,
  loading,
  hasApiKey,
  onSelectTrip,
  onDeleteTrip,
  onGoToSettings
}: TripsListProps) {
  if (loading) {
    return <div className='loading-message'>Loading your trips...</div>
  }

  if (trips.length === 0) {
    return (
      <div className='empty-state'>
        <h2>No trips yet</h2>
        <p>Create a new trip to get started planning your birding adventure!</p>
      </div>
    )
  }

  return (
    <div className='trips-list'>
      {!hasApiKey && (
        <div className='api-key-banner'>
          <span>
            ⚠️ No eBird API key set. Species and hotspot data won't load until
            you add one.
          </span>
          <button onClick={onGoToSettings} className='banner-link'>
            Go to Settings →
          </button>
        </div>
      )}
      <h2>My Trips</h2>
      <div className='trips-grid'>
        {trips.map((trip) => (
          <div key={trip.id} className='trip-card'>
            <div className='trip-card-header'>
              <h3>{trip.name}</h3>
              <button
                onClick={() => onDeleteTrip(trip.id)}
                className='btn-delete'
                title='Delete trip'
              >
                ×
              </button>
            </div>
            <p className='trip-location'>{trip.location}</p>
            <p className='trip-dates'>
              {new Date(trip.start_date).toLocaleDateString()} -{' '}
              {new Date(trip.end_date).toLocaleDateString()}
            </p>
            <button
              onClick={() => onSelectTrip(trip)}
              className='btn-primary'
              style={{ width: '100%', marginTop: '1rem' }}
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
