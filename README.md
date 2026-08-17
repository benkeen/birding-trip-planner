# Birding Trip Planner

A desktop application to help birders plan their trips by finding target species and optimal viewing locations using the eBird API.

## Features

- **User Accounts**: Create an account and save multiple trips
- **Trip Planning**: Enter trip details (name, location, dates)
- **eBird Integration**: Fetch target species for your destination
- **Species Filtering**: See which species will be present during your trip dates
- **Hotspot Mapping**: Find the best locations to spot your target species
- **Local Storage**: All trip data stored locally in SQLite

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Desktop**: Electron
- **Backend**: Express.js (runs in Electron)
- **Database**: SQLite (local)
- **Build**: Electron Vite + Vite

## Prerequisites

- Node.js 16+ and npm
- eBird API key (free, get it at https://ebird.org/api/keygen)

## Setup & Installation

### 1. Install Dependencies

```bash
npm install
```

This installs all dependencies including:

- `electron` - Desktop framework
- `react` - UI library
- `express` - Backend server
- `better-sqlite3` - Local database
- `bcrypt` - Password hashing
- `jsonwebtoken` - Session management

### 2. Environment Setup

The app stores data in your user directory. No additional configuration needed for development.

For production, update `JWT_SECRET` in `src/main/server.ts` to a secure value.

## Development

### Start the App

```bash
npm run dev
```

This will:

1. Start Electron in dev mode
2. Launch Vite dev server for hot reload
3. Start Express backend (runs on port 3000)
4. Open the app window with DevTools

### File Structure

```
├── src/
│   ├── main/              # Electron main process + Express backend
│   │   ├── index.ts       # App entry point
│   │   ├── server.ts      # Express routes
│   │   ├── db.ts          # Database queries
│   │   └── preload.ts     # IPC bridge
│   │
│   ├── renderer/          # React frontend
│   │   ├── App.tsx        # Root component
│   │   ├── index.tsx      # React entry point
│   │   ├── index.html     # HTML template
│   │   └── pages/         # Page components
│   │       ├── LoginPage.tsx
│   │       ├── Dashboard.tsx
│   │       ├── TripForm.tsx
│   │       ├── TripsList.tsx
│   │       └── TripDetails.tsx
│   │
│   └── shared/            # Shared TypeScript types
│       └── types.ts
│
├── db/
│   └── schema.sql         # Database schema
│
├── package.json
├── tsconfig.json
├── electron.vite.config.ts
└── electron-builder.config.yml
```

## Usage

### 1. Create Account

- Launch the app
- Sign up with email and password
- Password is hashed with bcrypt and stored locally

### 2. Plan a Trip

- Click "Plan New Trip"
- Enter:
  - **Trip Name**: e.g., "Costa Rica Rainforest Tour"
  - **Location**: Region code (e.g., CR, US-CA) or location name
  - **Dates**: Start and end dates for your trip
  - **eBird API Key**: Your personal eBird API key
- Click "Create Trip & Get Species"

### 3. View Species

- Trips are saved and listed on the dashboard
- Click "View Details" on a trip to see:
  - Target species for that location/date range
  - Likelihood % for each species
  - Best hotspots to see each species
  - Exact coordinates for each location

### 4. Manage Trips

- Delete trips from the trip list
- Retrieve and view saved trips anytime
- Data is never uploaded (all local)

## API Routes

The Express backend (runs on `http://localhost:3000`) provides:

### Auth

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

### Trips

- `GET /api/trips` - List user's trips
- `GET /api/trips/:id` - Get trip details
- `POST /api/trips` - Create trip
- `PUT /api/trips/:id` - Update trip
- `DELETE /api/trips/:id` - Delete trip

### eBird (Proxy)

- `POST /api/ebird/validate-key` - Test API key validity
- `GET /api/ebird/species/:region` - Get target species
- `GET /api/ebird/observations/:region/:species` - Get recent sightings
- `GET /api/ebird/hotspots/:region` - Get birding locations

## Database Schema

### Users Table

- `id` (integer, primary key)
- `email` (text, unique)
- `password_hash` (text, bcrypt hash)
- `created_at`, `updated_at` (timestamps)

### Trips Table

- `id`, `user_id`, `name`, `location`
- `latitude`, `longitude` (optional GPS coords)
- `start_date`, `end_date`
- `created_at`, `updated_at`

### Species Table

- `code` (text, unique eBird code)
- `common_name`, `scientific_name`
- `family`

### Trip Cache Table

- Stores eBird API responses to avoid redundant calls
- `cache_key` identifies query (e.g., "species_CR_2024-01")
- `expires_at` for cache invalidation

## Building for Distribution

### Package for Current Platform

```bash
npm run dist
```

This creates distributable files for your OS in the `dist` directory.

### macOS (.dmg)

```bash
npm run dist
# Creates: dist/Birding Trip Planner-x.x.x.dmg
```

### Windows (.exe)

```bash
npm run dist
# Creates: dist/Birding Trip Planner Setup x.x.x.exe
```

### Linux (.AppImage)

```bash
npm run dist
# Creates: dist/birding-trip-planner-x.x.x.AppImage
```

## Security Notes

- eBird API keys are **not stored** by default; users enter them per session
- Passwords are hashed with bcrypt (cost factor 10)
- JWTs expire after 7 days
- Change `JWT_SECRET` in `src/main/server.ts` for production
- All data is stored locally; nothing synced to cloud

## eBird API Limitations

- **Rate Limiting**: No published limits, but eBird requests restraint
- **Frequency Data**: Historical likelihood of species by month (not real-time)
- **Hotspots**: Recent observation data (typically last 6 months)
- **Contact eBird**: For heavy usage, contact support@ebird.org

## Future Enhancements

- [ ] OAuth authentication with eBird
- [ ] Real-time likelihood predictions using machine learning
- [ ] Map view with GPS integration
- [ ] Cloud sync and backup
- [ ] Mobile app version
- [ ] Trip sharing and collaboration
- [ ] Advanced filtering (elevation, habitat, seasonality)
- [ ] Checklist tracking during trips

## Troubleshooting

### App won't start

- Check that Node.js is installed: `node --version`
- Make sure dependencies are installed: `npm install`
- Check for port 3000 conflicts: `lsof -i :3000` (macOS/Linux)

### Database errors

- Delete `~/Library/Application Support/birding-trip-planner/app.db` (macOS) and restart
- On Linux: `~/.config/birding-trip-planner/app.db`
- On Windows: `%APPDATA%\birding-trip-planner\app.db`

### eBird API key not working

- Verify key at https://ebird.org/api/keygen
- Ensure the key is valid and not expired
- Check network connection

### Hot reload not working

- Make sure `npm run dev` is running
- Check DevTools console for errors
- Restart the dev server

## Development Tips

- Press F12 or Cmd+Option+I to open DevTools
- Use Redux DevTools browser extension for state debugging
- Check `~/Library/Application Support/birding-trip-planner/` for logs and database

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file

## Resources

- [eBird API Docs](https://documenter.getpostman.com/view/664302/S1nxaKp3)
- [Electron Docs](https://www.electronjs.org/docs)
- [React Docs](https://react.dev)
- [Express Docs](https://expressjs.com)
