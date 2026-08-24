import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import './App.css'
import type { User } from '@shared/types'
import Dashboard from './pages/Dashboard'

const theme = createTheme({
  palette: {
    primary: { main: '#2563eb' },
    secondary: { main: '#764ba2' }
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'sans-serif'
    ].join(',')
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true
      }
    }
  }
})

// Default user for local app without auth
const defaultUser: User = {
  id: 1,
  email: 'user@local',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}

const defaultToken = 'local-token'

function App() {
  const handleLogout = () => {
    // No-op for now since there's no auth
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Dashboard
        user={defaultUser}
        token={defaultToken}
        onLogout={handleLogout}
      />
    </ThemeProvider>
  )
}

export default App
