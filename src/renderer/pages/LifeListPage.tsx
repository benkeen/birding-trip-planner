import { useState, useEffect, useRef } from 'react'
import {
  Container,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Link,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from '@mui/material'
import { FileUpload } from '@mui/icons-material'

interface LifeListEntry {
  common_name: string
  scientific_name: string
  date: string
  count: number
  location: string
  location_id: string
  latitude: number
  longitude: number
}

interface LifeListPageProps {
  token: string
  ebirdApiKey: string
}

export default function LifeListPage({
  token,
  ebirdApiKey
}: LifeListPageProps) {
  const [lifeList, setLifeList] = useState<LifeListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Load cached life list on mount
    loadCachedLifeList()
  }, [])

  const loadCachedLifeList = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/life-list', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.species && data.species.length > 0) {
          setLifeList(data.species)
        }
      }
    } catch (err) {
      console.error('Failed to load cached life list:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleImportLifeList = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(
        'http://localhost:3000/api/life-list/import',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        }
      )

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const data = await response.json()
      setLifeList(data.species)
      console.log(`✨ Imported ${data.species.length} species`)
    } catch (err) {
      console.error('Failed to import life list:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to import life list'
      )
    } finally {
      setLoading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Container maxWidth='lg' sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant='h4' sx={{ fontWeight: 600, mb: 1 }}>
          Life List
        </Typography>
        <Typography variant='body2' sx={{ color: '#64748b' }}>
          All bird species you've recorded
        </Typography>
      </Box>

      {error && (
        <Alert severity='error' sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && lifeList.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 4,
            border: '1px solid #e2e8f0',
            borderRadius: 1,
            backgroundColor: '#f8fafc'
          }}
        >
          <Typography sx={{ color: '#64748b', mb: 2 }}>
            Visit{' '}
            <Link
              href='https://ebird.org/downloadMyData'
              target='_blank'
              rel='noopener noreferrer'
              sx={{ fontWeight: 600 }}
            >
              eBird
            </Link>{' '}
            to download your life list data. When you've received the email with
            your life list, click the button below to upload the zip file.
          </Typography>
          <Button
            variant='contained'
            startIcon={<FileUpload />}
            onClick={handleImportLifeList}
            disabled={loading}
            sx={{ textTransform: 'none', boxShadow: 'none', mt: 2 }}
          >
            Import
          </Button>
          <input
            ref={fileInputRef}
            type='file'
            accept='.zip'
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </Box>
      )}

      {!loading && lifeList.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2
            }}
          >
            <Typography variant='body2' sx={{ fontWeight: 600 }}>
              Total species: {lifeList.length}
            </Typography>
            <Button
              size='small'
              onClick={handleImportLifeList}
              startIcon={<FileUpload />}
              sx={{ textTransform: 'none', boxShadow: 'none' }}
            >
              Update List
            </Button>
            <input
              ref={fileInputRef}
              type='file'
              accept='.zip'
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Table sx={{ backgroundColor: '#fff' }}>
              <TableHead>
                <TableRow sx={{ backgroundColor: '#f1f5f9' }}>
                  <TableCell sx={{ fontWeight: 600, width: '60px' }} />
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    First Seen
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Species</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    Scientific Name
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Count</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lifeList.map((entry, idx) => {
                  const date = new Date(entry.date)
                  const formattedDate = date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })

                  return (
                    <TableRow
                      key={idx}
                      sx={{ '&:hover': { backgroundColor: '#f8fafc' } }}
                    >
                      <TableCell
                        sx={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: '#94a3b8'
                        }}
                      >
                        {lifeList.length - idx}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontSize: '0.875rem',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {formattedDate}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                        {entry.common_name}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontSize: '0.875rem',
                          color: '#64748b',
                          fontStyle: 'italic'
                        }}
                      >
                        {entry.scientific_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.875rem' }}>
                        {entry.count}
                      </TableCell>
                      <TableCell
                        sx={{ fontSize: '0.875rem', color: '#64748b' }}
                      >
                        {entry.location_id ? (
                          <Link
                            href={`https://ebird.org/hotspot/${entry.location_id}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            sx={{
                              color: '#3b82f6',
                              fontWeight: 500,
                              cursor: 'pointer'
                            }}
                          >
                            {entry.location}
                          </Link>
                        ) : (
                          entry.location
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        </Box>
      )}
    </Container>
  )
}
