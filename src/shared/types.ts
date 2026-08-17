// User types
export interface User {
  id: number
  email: string
  created_at: string
  updated_at: string
}

export interface AuthPayload {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

// Trip types
export interface Trip {
  id: number
  user_id: number
  name: string
  location: string
  latitude?: number
  longitude?: number
  start_date: string
  end_date: string
  created_at: string
  updated_at: string
}

export interface CreateTripRequest {
  name: string
  location: string
  latitude?: number
  longitude?: number
  start_date: string
  end_date: string
  ebird_api_key: string
}

// Species types
export interface Species {
  code: string
  common_name: string
  scientific_name: string
  family?: string
}

export interface HistoricSpecies {
  code: string
  comName: string
  sciName: string
  checklistFrequency: number // 0-1 (percentage of checklists containing species)
  totalReports: number // Total number of observations
}

export interface TripSpecies extends Species {
  likelihood_percent: number
  hotspots: Hotspot[]
  notes?: string
}

// Hotspot types
export interface Hotspot {
  code: string
  name: string
  latitude: number
  longitude: number
  country_code: string
  state_code?: string
  county_code?: string
  recent_observations?: number
  last_observation_date?: string
}

// eBird API types
export interface EbirdFrequencyData {
  code: string
  common_name: string
  scientific_name: string
  frequency: number[] // 12 months of percentages
}

export interface EbirdObservation {
  speciesCode: string
  comName: string
  sciName: string
  locId: string
  locName: string
  obsDt: string
  howMany?: number
  lat: number
  lng: number
}

export interface ApiError {
  code: string
  message: string
  status?: number
}
