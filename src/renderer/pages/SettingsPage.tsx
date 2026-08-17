import { useState, useRef } from 'react'
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
  Typography,
  CircularProgress
} from '@mui/material'
import {
  CheckCircle,
  ContentCopy,
  Visibility,
  VisibilityOff,
  FileUpload
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
  const [ebdLoading, setEbdLoading] = useState(false)
  const [ebdError, setEbdError] = useState('')
  const ebdFileInputRef = useRef<HTMLInputElement>(null)

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

  const handleImportEbd = () => {
    ebdFileInputRef.current?.click()
  }

  const handleEbdFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    setEbdLoading(true)
    setEbdError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('http://localhost:3000/api/ebd/import', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      setToastMessage('EBD data imported successfully!')
      setToastOpen(true)
      console.log('✨ Imported EBD data')
    } catch (err) {
      console.error('Failed to import EBD:', err)
      setEbdError(
        err instanceof Error ? err.message : 'Failed to import EBD data'
      )
    } finally {
      setEbdLoading(false)
      // Reset file input
      if (ebdFileInputRef.current) {
        ebdFileInputRef.current.value = ''
      }
    }
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

      <Paper variant='outlined' sx={{ p: 3, mt: 2 }}>
        <Typography variant='subtitle1' fontWeight={600} gutterBottom>
          eBird Basic Data (EBD)
        </Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          To use this tool you need to request and download the eBird Basic
          Dataset (EBD) from eBird. This contains the full, current taxonomy
          which is used for species matching and validation.
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
            ebird.org/data/download
            <Tooltip title='Copy URL'>
              <IconButton
                size='small'
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    'https://ebird.org/data/download'
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

        {ebdError && (
          <Alert severity='error' sx={{ mb: 2 }}>
            {ebdError}
          </Alert>
        )}

        <Button
          variant='contained'
          startIcon={
            ebdLoading ? <CircularProgress size={20} /> : <FileUpload />
          }
          onClick={handleImportEbd}
          disabled={ebdLoading}
          sx={{ textTransform: 'none', boxShadow: 'none' }}
        >
          {ebdLoading ? 'Importing...' : 'Import EBD'}
        </Button>
        <input
          ref={ebdFileInputRef}
          type='file'
          accept='.txt,.csv'
          onChange={handleEbdFileSelect}
          style={{ display: 'none' }}
        />
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
