import { useState, useEffect } from 'react'
import type { User, Trip } from '@shared/types'
import { Button } from '@mui/material'
import TripForm from './TripForm'
import TripsList from './TripsList'
import TripDetails from './TripDetails'
import LifeListPage from './LifeListPage'
import SettingsPage from './SettingsPage'
import './Dashboard.css'

interface DashboardProps {
  user: User
  token: string
  onLogout: () => void
}

export default function Dashboard({ user, token, onLogout }: DashboardProps) {
  const [view, setView] = useState<
    'list' | 'form' | 'details' | 'lifeList' | 'settings'
  >('list')
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [ebirdApiKey, setEbirdApiKey] = useState<string>(
    () => localStorage.getItem('ebird_api_key') ?? ''
  )

  const handleSaveApiKey = (key: string) => {
    localStorage.setItem('ebird_api_key', key)
    setEbirdApiKey(key)
  }

  useEffect(() => {
    fetchTrips()
  }, [])

  const fetchTrips = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/trips', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      setTrips(data)
    } catch (err) {
      console.error('Failed to fetch trips:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTrip = async (tripData: any) => {
    try {
      const response = await fetch('http://localhost:3000/api/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(tripData)
      })

      if (response.ok) {
        const newTrip = await response.json()
        setTrips([newTrip, ...trips])
        setView('list')
      }
    } catch (err) {
      console.error('Failed to create trip:', err)
    }
  }

  const handleViewTrip = (trip: Trip) => {
    setSelectedTrip(trip)
    setView('details')
  }

  const handleDeleteTrip = async (tripId: number) => {
    try {
      const response = await fetch(
        `http://localhost:3000/api/trips/${tripId}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }
      )

      if (response.ok) {
        setTrips(trips.filter((t) => t.id !== tripId))
        setView('list')
      }
    } catch (err) {
      console.error('Failed to delete trip:', err)
    }
  }

  return (
    <div className='dashboard'>
      <header className='dashboard-header'>
        <div className='header-left'>
          <h1>Birding Trip Planner</h1>
        </div>
        <div className='header-right'>
          <span className='user-email'>{user.email}</span>
          <Button onClick={onLogout} variant='contained' size='small'>
            Log Out
          </Button>
        </div>
      </header>

      <div className='dashboard-content'>
        <nav className='dashboard-nav'>
          <button
            className={`nav-button ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            My Trips
          </button>
          <button
            className={`nav-button ${view === 'form' ? 'active' : ''}`}
            onClick={() => setView('form')}
          >
            Plan New Trip
          </button>
          <button
            className={`nav-button ${view === 'lifeList' ? 'active' : ''}`}
            onClick={() => setView('lifeList')}
          >
            Life List
          </button>
          <button
            className={`nav-button ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>

        <main className='dashboard-main'>
          {view === 'list' && (
            <TripsList
              trips={trips}
              loading={loading}
              hasApiKey={!!ebirdApiKey}
              onSelectTrip={handleViewTrip}
              onDeleteTrip={handleDeleteTrip}
              onGoToSettings={() => setView('settings')}
            />
          )}

          {view === 'form' && (
            <TripForm onSubmit={handleCreateTrip} token={token} />
          )}

          {view === 'lifeList' && (
            <LifeListPage token={token} ebirdApiKey={ebirdApiKey} />
          )}

          {view === 'settings' && (
            <SettingsPage
              ebirdApiKey={ebirdApiKey}
              onSaveApiKey={handleSaveApiKey}
            />
          )}

          {view === 'details' && selectedTrip && (
            <TripDetails
              trip={selectedTrip}
              token={token}
              ebirdApiKey={ebirdApiKey}
              onBack={() => setView('list')}
            />
          )}
        </main>
      </div>
    </div>
  )
}
