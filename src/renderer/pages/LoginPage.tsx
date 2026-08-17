import { useState } from 'react'
import type { User } from '@shared/types'
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Snackbar,
  Alert,
  TextField,
  Typography,
  Paper,
  Stack
} from '@mui/material'
import { ContentCopy, Visibility, VisibilityOff, AutoAwesome } from '@mui/icons-material'

interface LoginPageProps {
  onLogin: (token: string, user: User) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const copyPassword = async (): Promise<void> => {
    if (!password) return
    await navigator.clipboard.writeText(password)
    setToastOpen(true)
  }

  const generatePassword = (): void => {
    const length = 16
    const charset =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    let generated = ''
    for (let i = 0; i < length; i++) {
      generated += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    setPassword(generated)
    setShowPassword(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login'

    try {
      const response = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Authentication failed')
        return
      }

      onLogin(data.token, data.user)
    } catch (err) {
      setError('Network error. Make sure the server is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        p: 2
      }}
    >
      <Paper elevation={6} sx={{ p: 4, width: '100%', maxWidth: 420, borderRadius: 2 }}>
        <Typography variant='h4' fontWeight={700} textAlign='center' gutterBottom>
          Birding Trip Planner
        </Typography>
        <Typography variant='body2' color='text.secondary' textAlign='center' sx={{ mb: 3 }}>
          Reduce manual research time by identifying which lifers are present in
          the region you're visiting and finding key locations.
        </Typography>

        {error && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack component='form' onSubmit={handleSubmit} spacing={2}>
          <TextField
            id='email'
            type='email'
            label='Email'
            placeholder='your@email.com'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            size='small'
          />

          <TextField
            id='password'
            label='Password'
            type={showPassword ? 'text' : 'password'}
            placeholder='Enter password'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            size='small'
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position='end'>
                    <IconButton
                      onClick={copyPassword}
                      disabled={!password}
                      title='Copy password'
                      size='small'
                    >
                      <ContentCopy fontSize='small' />
                    </IconButton>
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      size='small'
                    >
                      {showPassword ? (
                        <VisibilityOff fontSize='small' />
                      ) : (
                        <Visibility fontSize='small' />
                      )}
                    </IconButton>
                  </InputAdornment>
                )
              }
            }}
          />

          {isSignup && (
            <Button
              type='button'
              variant='outlined'
              size='small'
              startIcon={<AutoAwesome />}
              onClick={generatePassword}
              fullWidth
            >
              Generate Password
            </Button>
          )}

          <Button
            type='submit'
            variant='contained'
            disabled={loading}
            fullWidth
            size='large'
          >
            {loading ? 'Please wait...' : isSignup ? 'Create Account' : 'Sign In'}
          </Button>
        </Stack>

        <Typography variant='body2' color='text.secondary' textAlign='center' sx={{ mt: 2 }}>
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Box
                component='span'
                onClick={() => setIsSignup(false)}
                sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Sign In
              </Box>
            </>
          ) : (
            <>
              Don't have an account?{' '}
              <Box
                component='span'
                onClick={() => setIsSignup(true)}
                sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Create One
              </Box>
            </>
          )}
        </Typography>
      </Paper>

      <Snackbar
        open={toastOpen}
        autoHideDuration={2500}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToastOpen(false)} severity='success' variant='filled'>
          Saved to clipboard
        </Alert>
      </Snackbar>
    </Box>
  )
}
