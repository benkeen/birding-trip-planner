import { useEffect } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapLocation {
  name: string
  lat: number
  lng: number
  count: number
}

interface TripMapProps {
  locations: MapLocation[]
  fallbackCenter: [number, number]
}

// Fits the map view to all plotted locations whenever they change
function FitBounds({ locations }: { locations: MapLocation[] }) {
  const map = useMap()

  useEffect(() => {
    if (locations.length === 0) return
    const bounds = L.latLngBounds(
      locations.map((loc) => [loc.lat, loc.lng] as [number, number])
    )
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 })
  }, [locations, map])

  return null
}

export default function TripMap({ locations, fallbackCenter }: TripMapProps) {
  const maxCount = locations.reduce((max, loc) => Math.max(max, loc.count), 1)

  return (
    <MapContainer
      center={fallbackCenter}
      zoom={9}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
      />
      <FitBounds locations={locations} />
      {locations.map((loc, idx) => {
        const radius = 5 + Math.round((loc.count / maxCount) * 15)
        return (
          <CircleMarker
            key={`${loc.name}-${loc.lat}-${loc.lng}-${idx}`}
            center={[loc.lat, loc.lng]}
            radius={radius}
            pathOptions={{
              color: '#2563eb',
              fillColor: '#3b82f6',
              fillOpacity: 0.5,
              weight: 1
            }}
          >
            <Tooltip>
              <strong>{loc.name}</strong>
              <br />
              {loc.count} observation{loc.count === 1 ? '' : 's'}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
