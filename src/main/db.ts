import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { User, Trip, Species } from '@shared/types'

let db: Database.Database

export function initializeDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'app.db')
  db = new Database(dbPath)

  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Load and execute schema
  const schemaPath = path.join(__dirname, '../../db/schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf-8')
  db.exec(schema)
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

// User queries
export function getUserByEmail(email: string): User | null {
  const db = getDatabase()
  const stmt = db.prepare(
    'SELECT id, email, created_at, updated_at FROM users WHERE email = ?'
  )
  return stmt.get(email) as User | null
}

export function createUser(email: string, passwordHash: string): User {
  const db = getDatabase()
  const stmt = db.prepare(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)'
  )
  const result = stmt.run(email, passwordHash)
  return getUserById(result.lastInsertRowid as number)!
}

export function getUserById(id: number): User | null {
  const db = getDatabase()
  const stmt = db.prepare(
    'SELECT id, email, created_at, updated_at FROM users WHERE id = ?'
  )
  return stmt.get(id) as User | null
}

export function getUserPasswordHash(email: string): string | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT password_hash FROM users WHERE email = ?')
  const result = stmt.get(email) as { password_hash: string } | null
  return result?.password_hash || null
}

// Trip queries
export function getUserTrips(userId: number): Trip[] {
  const db = getDatabase()
  const stmt = db.prepare(
    'SELECT * FROM trips WHERE user_id = ? ORDER BY updated_at DESC'
  )
  return stmt.all(userId) as Trip[]
}

export function getTripById(tripId: number, userId: number): Trip | null {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?')
  return stmt.get(tripId, userId) as Trip | null
}

export function createTrip(
  userId: number,
  name: string,
  location: string,
  startDate: string,
  endDate: string,
  latitude?: number,
  longitude?: number
): Trip {
  const db = getDatabase()
  const stmt = db.prepare(
    `INSERT INTO trips (user_id, name, location, latitude, longitude, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const result = stmt.run(
    userId,
    name,
    location,
    latitude || null,
    longitude || null,
    startDate,
    endDate
  )
  return getTripById(result.lastInsertRowid as number, userId)!
}

export function updateTrip(
  tripId: number,
  userId: number,
  updates: Partial<Trip>
): Trip {
  const db = getDatabase()
  const allowedFields = [
    'name',
    'location',
    'latitude',
    'longitude',
    'start_date',
    'end_date'
  ]
  const fieldsToUpdate = Object.keys(updates).filter((key) =>
    allowedFields.includes(key)
  )

  if (fieldsToUpdate.length === 0) {
    return getTripById(tripId, userId)!
  }

  const setClause = fieldsToUpdate.map((field) => `${field} = ?`).join(', ')
  const values = fieldsToUpdate.map((field) => updates[field as keyof Trip])

  const stmt = db.prepare(
    `UPDATE trips SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
  )
  stmt.run(...values, tripId, userId)
  return getTripById(tripId, userId)!
}

export function deleteTrip(tripId: number, userId: number): boolean {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?')
  const result = stmt.run(tripId, userId)
  return (result.changes || 0) > 0
}

// Cache queries
export function getCacheData(tripId: number, cacheKey: string): string | null {
  const db = getDatabase()
  const stmt = db.prepare(
    'SELECT data FROM trip_cache WHERE trip_id = ? AND cache_key = ? AND (expires_at IS NULL OR expires_at > datetime("now"))'
  )
  const result = stmt.get(tripId, cacheKey) as { data: string } | null
  return result?.data || null
}

export function setCacheData(
  tripId: number,
  cacheKey: string,
  data: string,
  expiresInHours?: number
): void {
  const db = getDatabase()
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null

  const stmt = db.prepare(
    `INSERT OR REPLACE INTO trip_cache (trip_id, cache_key, data, expires_at)
     VALUES (?, ?, ?, ?)`
  )
  stmt.run(tripId, cacheKey, data, expiresAt)
}

// Species queries
export function getOrCreateSpecies(
  code: string,
  commonName: string,
  scientificName: string,
  family?: string
): Species {
  const db = getDatabase()
  const existing = db
    .prepare('SELECT * FROM species WHERE code = ?')
    .get(code) as Species | null

  if (existing) return existing

  db.prepare(
    'INSERT INTO species (code, common_name, scientific_name, family) VALUES (?, ?, ?, ?)'
  ).run(code, commonName, scientificName, family || null)

  return db.prepare('SELECT * FROM species WHERE code = ?').get(code) as Species
}

export function closeDatabase(): void {
  if (db) {
    db.close()
  }
}
