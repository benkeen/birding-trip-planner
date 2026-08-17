import { useState } from 'react'
import './TripForm.css'

interface TripFormProps {
  onSubmit: (data: any) => void
  token: string
}

export default function TripForm({ onSubmit, token }: TripFormProps) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      onSubmit({ name, location, start_date: startDate, end_date: endDate })
      setName('')
      setLocation('')
      setStartDate('')
      setEndDate('')
    } catch (err) {
      setError('Failed to create trip.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='trip-form-container'>
      <h2>Plan a New Birding Trip</h2>

      {error && <div className='alert alert-error'>{error}</div>}

      <form onSubmit={handleSubmit} className='trip-form'>
        <div className='form-row'>
          <div className='form-group'>
            <label htmlFor='name'>Trip Name</label>
            <input
              id='name'
              type='text'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g., Costa Rica Rainforest Tour'
              required
            />
          </div>

          <div className='form-group'>
            <label htmlFor='location'>eBird Region Code</label>
            <input
              id='location'
              type='text'
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder='e.g., San José, Costa Rica or US-CA-SF'
              required
            />
          </div>
        </div>

        <div className='form-row'>
          <div className='form-group'>
            <label htmlFor='startDate'>Start Date</label>
            <input
              id='startDate'
              type='date'
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className='form-group'>
            <label htmlFor='endDate'>End Date</label>
            <input
              id='endDate'
              type='date'
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>

        <button
          type='submit'
          className='btn-primary btn-large'
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Trip'}
        </button>
      </form>

      <div className='form-help'>
        <h3>How to find a region code</h3>
        <p>eBird region codes follow a structured format:</p>
        <ul>
          <li>
            <strong>Country</strong> — 2-letter ISO code. e.g. <code>CR</code>{' '}
            (Costa Rica), <code>AU</code> (Australia), <code>MX</code> (Mexico)
          </li>
          <li>
            <strong>US state</strong> — <code>US-</code> + 2-letter state. e.g.{' '}
            <code>US-CA</code>, <code>US-TX</code>, <code>US-FL</code>
          </li>
          <li>
            <strong>US county</strong> — state code + county number. e.g.{' '}
            <code>US-CA-037</code> (Los Angeles County)
          </li>
          <li>
            <strong>Subnational regions</strong> — most countries follow{' '}
            <code>XX-YY</code> format. e.g. <code>GB-ENG</code> (England),{' '}
            <code>MX-OAX</code> (Oaxaca)
          </li>
        </ul>
        <p style={{ marginTop: '0.75rem' }}>
          <strong>To look up any code:</strong> go to{' '}
          <code>ebird.org/region/YOURCODE</code> in a browser (e.g.{' '}
          <code>ebird.org/region/CR</code>) and eBird will confirm the region or
          suggest corrections. The code also appears in the URL when you browse
          any region page on eBird.
        </p>
      </div>
    </div>
  )
}
