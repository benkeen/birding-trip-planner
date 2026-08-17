import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'
import {
  CheckCircle,
  ContentCopy,
  Visibility,
  VisibilityOff
} from '@mui/icons-material'

interface SettingsPageProps {
  ebirdApiKey: string
  onSaveApiKey: (key: string) => void
}

export default function SettingsPage({
  ebirdApiKey,
  onSaveApiKey
}: SettingsPageProps) {
  const [keyInput, setKeyInput] = useState(ebirdApiKey)
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')
    setValidating(true)

    try {
      const response = await fetch(
        'http://localhost:3000/api/ebird/validate-key',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: keyInput.trim() })
        }
      )

      if (!response.ok) {
        setValidationError('Invalid API key — check it and try again.')
        return
      }

      onSaveApiKey(keyInput.trim())
      setToastMessage('API key saved!')
      setToastOpen(true)
    } catch {
      setValidationError(
        'Could not reach the server. Make sure the app is running.'
      )
    } finally {
      setValidating(false)
    }
  }

  const handleCopy = async () => {
    if (!keyInput) return
    await navigator.clipboard.writeText(keyInput)
    setToastMessage('Copied to clipboard')
    setToastOpen(true)
  }

  const isSaved = ebirdApiKey === keyInput.trim() && ebirdApiKey.length > 0
  const isDirty = keyInput.trim() !== ebirdApiKey

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant='h5' fontWeight={600} gutterBottom>
        Settings
      </Typography>

      <Paper variant='outlined' sx={{ p: 3, mt: 2 }}>
        <Typography variant='subtitle1' fontWeight={600} gutterBottom>
          eBird API Key
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          Required to fetch target species and hotspot data. Your key is stored
          locally on this device only.
          <Box
            component='span'
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 0.75,
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: 'text.primary'
            }}
          >
            ebird.org/api/keygen
            <Tooltip title='Copy URL'>
              <IconButton
                size='small'
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    'https://ebird.org/api/keygen'
                  )
                  setToastMessage('URL copied to clipboard')
                  setToastOpen(true)
                }}
                sx={{ p: 0.25 }}
              >
                <ContentCopy sx={{ fontSize: '0.875rem' }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Typography>

        {validationError && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {validationError}
          </Alert>
        )}

        <Stack component='form' onSubmit={handleSave} spacing={2}>
          <TextField
            label='API Key'
            type={showKey ? 'text' : 'password'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder='Paste your eBird API key here'
            fullWidth
            size='small'
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position='end'>
                    {isSaved && (
                      <CheckCircle
                        fontSize='small'
                        color='success'
                        sx={{ mr: 0.5 }}
                      />
                    )}
                    <IconButton
                      onClick={handleCopy}
                      disabled={!keyInput}
                      title='Copy key'
                      size='small'
                    >
                      <ContentCopy fontSize='small' />
                    </IconButton>
                    <IconButton
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? 'Hide key' : 'Show key'}
                      size='small'
                    >
                      {showKey ? (
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

          <Button
            type='submit'
            variant='contained'
            disabled={validating || !keyInput.trim() || !isDirty}
          >
            {validating ? 'Validating...' : 'Save API Key'}
          </Button>
        </Stack>
      </Paper>

      <Snackbar
        open={toastOpen}
        autoHideDuration={2500}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity='success'
          variant='filled'
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </Box>
  )
}
