# Getting Started - Birding Trip Planner

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

This installs all packages including Electron, React, Express, SQLite, etc.

**Note**: If you get native module errors (e.g., `better-sqlite3`), you may need to rebuild:

```bash
npm run build
```

### 2. Get an eBird API Key

- Go to https://ebird.org/api/keygen
- Sign in with your eBird account (or create one)
- Your API key will appear immediately
- Copy and keep it handy for testing

### 3. Start Development Server

```bash
npm run dev
```

This will:

- Launch Electron window
- Start Vite dev server (hot reload enabled)
- Start Express backend on http://localhost:3000
- Open DevTools for debugging

### 4. Test the App

**First Time:**

1. Click "Create One" to sign up
2. Enter any email and password
3. Click "Plan New Trip"
4. Fill in test data:
   - **Trip Name**: "Costa Rica Test"
   - **Location**: "CR" (Costa Rica region code)
   - **Dates**: Pick any range
   - **API Key**: Paste your eBird key
5. Click "Create Trip & Get Species"

**Expected Results:**

- Trip saved to local database
- Trip appears in "My Trips"
- Click "View Details" to see placeholder species data
- (Real species integration coming next)

### 5. Check the Database

The app creates a SQLite database at:

- **macOS**: `~/Library/Application Support/birding-trip-planner/app.db`
- **Linux**: `~/.config/birding-trip-planner/app.db`
- **Windows**: `%APPDATA%\birding-trip-planner\app.db`

You can inspect it with:

```bash
# macOS/Linux
sqlite3 ~/Library/Application\ Support/birding-trip-planner/app.db
sqlite> SELECT * FROM users;
sqlite> SELECT * FROM trips;
```

## Common Issues

### "Port 3000 already in use"

Kill the process using port 3000:

```bash
# macOS/Linux
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Windows
netstat -ano | findstr :3000
# Then: taskkill /PID <PID> /F
```

### "Module not found" errors

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### "Native module compilation failed" (better-sqlite3)

```bash
npm run build
# or
npx electron-rebuild
```

### Database errors

Delete the database and restart:

```bash
rm ~/Library/Application\ Support/birding-trip-planner/app.db
npm run dev
```

## Development Workflow

1. **Frontend changes**: Edit files in `src/renderer/pages/` → Auto-reload
2. **Backend changes**: Edit files in `src/main/server.ts` → Restart dev server
3. **Database changes**: Edit `db/schema.sql` → Delete database and restart
4. **Types**: Edit `src/shared/types.ts` → Auto-rebuild

## Next Development Steps

### Phase 1: Connect Real eBird Data ⭐ (Priority)

Edit `src/renderer/pages/TripDetails.tsx`:

- Replace hardcoded species with actual eBird API calls
- Fetch species list for the trip's region
- Filter by date (use frequency data)
- Fetch hotspots for each species

Relevant backend endpoints already exist:

- `GET /api/ebird/species/:region?api_key=KEY`
- `GET /api/ebird/observations/:region/:species?api_key=KEY`
- `GET /api/ebird/hotspots/:region?api_key=KEY`

### Phase 2: Improve UI

- Add loading states
- Error handling for API failures
- Map integration for hotspot viewing
- Species image/sound integration

### Phase 3: Advanced Filtering

- Filter species by likelihood threshold
- Search/filter species by name
- Sort by likelihood or alphabetical

### Phase 4: Export & Sharing

- Export trip as PDF
- Print checklist for field use
- Share trips (future cloud feature)

## Useful Commands

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
npm run dist         # Package for macOS/Windows/Linux
npm run type-check   # Check TypeScript for errors
```

## File Structure Reference

```
src/
├── main/
│   ├── index.ts         ← Electron main process entry
│   ├── server.ts        ← Express API routes
│   ├── db.ts            ← SQLite queries
│   └── preload.ts       ← IPC bridge
├── renderer/
│   ├── App.tsx          ← Root component
│   ├── index.tsx        ← React entry
│   └── pages/           ← Page components
└── shared/
    └── types.ts         ← Shared TypeScript interfaces
```

## Tips for Success

1. **Use DevTools**: Press F12 to open Developer Tools
   - Network tab: See API calls to backend
   - Console: Debug JavaScript
   - Storage: Check localStorage (auth token stored there)

2. **Check Terminal**: Look for errors when dev server starts
   - Backend errors show in main terminal
   - Frontend errors in DevTools console

3. **Use VSCode Extensions**:
   - ESLint (for code quality)
   - Prettier (for formatting)
   - SQLite (to view database)

4. **API Testing**: Use curl or Postman to test backend endpoints

   ```bash
   curl http://localhost:3000/api/health
   ```

5. **Performance**: The app uses React's hooks; check React DevTools for re-render issues

## Getting Help

- Check README.md for full documentation
- Look at console errors (DevTools, terminal)
- Check database schema in `db/schema.sql`
- Review TypeScript types in `src/shared/types.ts`
- eBird API docs: https://documenter.getpostman.com/view/664302/S1nxaKp3

Good luck! 🐦
