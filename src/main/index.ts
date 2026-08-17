import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import { initializeDatabase, closeDatabase } from './db'
import { createExpressApp } from './server'
import type { Server } from 'http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '../..')

// Remove electron security warnings in development
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

let mainWindow: BrowserWindow | null = null
let expressServer: Server | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.cjs')
    }
  })

  const url = process.env.VITE_DEV_SERVER_URL

  if (url) {
    console.log(`Loading dev server: ${url}`)
    mainWindow.loadURL(url)
  } else {
    // Try localhost:5173 as fallback for dev, otherwise load from file
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      const indexPath = path.join(__dirname, '../renderer/index.html')
      console.log(`Loading file: ${indexPath}`)
      mainWindow?.loadFile(indexPath)
    })
  }

  // Open DevTools only in development mode (commented out for production)
  // mainWindow.webContents.openDevTools()

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Start Express server
function startServer() {
  const app = createExpressApp()
  const PORT = parseInt(process.env.SERVER_PORT || '3000', 10)

  expressServer = app.listen(PORT, '127.0.0.1', () => {
    console.log(`Express server running on port ${PORT}`)
  })

  // Allow reuse of the port immediately after closing
  expressServer.keepAliveTimeout = 60000
  expressServer.headersTimeout = 65000

  // Handle server errors
  expressServer.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} is already in use. Please close the existing process and try again.`
      )
      console.error(
        'To manually free the port, run: lsof -i :' +
          PORT +
          ' | awk "NR!=1 {print $2}" | xargs kill -9'
      )
    } else {
      console.error('Server error:', err)
    }
    process.exit(1)
  })
}

// App event handlers
app.on('ready', () => {
  initializeDatabase()
  startServer()
  createWindow()
  createMenu()
})

app.on('window-all-closed', () => {
  // On macOS, apps typically stay open until user quits explicitly via menu or Cmd+Q
  // On Windows/Linux, close when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', (event) => {
  // Gracefully shut down the Express server and database
  console.log('Shutting down application...')
  if (expressServer) {
    event.preventDefault() // Prevent quit until cleanup is done

    console.log('Closing Express server...')
    expressServer.close(() => {
      console.log('Express server closed')
      closeDatabase()
      console.log('Database closed. Exiting.')
      // Force quit after cleanup
      process.exit(0)
    })

    // Force quit after 5 seconds if server doesn't close
    setTimeout(() => {
      console.log('Force closing application after timeout')
      closeDatabase()
      process.exit(0)
    }, 5000)
  } else {
    closeDatabase()
  }
})

app.on('quit', () => {
  // Final cleanup (may not always be called due to process.exit above)
  closeDatabase()
  if (expressServer && !expressServer.closed) {
    expressServer.close()
  }
})

// Create application menu
function createMenu() {
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' }
      ]
    }
  ]

  if (process.env.NODE_ENV === 'development') {
    template.push({
      label: 'Development',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow?.webContents.toggleDevTools()
          }
        }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// IPC handlers
ipcMain.handle('get-app-path', () => {
  return app.getAppPath()
})
