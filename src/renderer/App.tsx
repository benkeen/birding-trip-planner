import { useState, useEffect } from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import './App.css'
import type { User } from '@shared/types'
import LoginPage from './pages/LoginPage'
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

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('token')
  )

  useEffect(() => {
    if (token) {
      // Verify token by fetching current user
      fetch('http://localhost:3000/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setToken(null)
            localStorage.removeItem('token')
          } else {
            setUser(data)
          }
        })
        .catch(() => {
          setToken(null)
          localStorage.removeItem('token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const handleLogin = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('token', newToken)
  }

  const handleLogout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
  }

  if (loading) {
    return <div className='loading'>Loading...</div>
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!user || !token ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <Dashboard user={user} token={token} onLogout={handleLogout} />
      )}
    </ThemeProvider>
  )
}

export default App
