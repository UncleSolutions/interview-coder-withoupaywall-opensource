import { BrowserWindow, dialog, ipcMain } from 'electron';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { configHelper } from './ConfigHelper';
import path from 'path';
import * as os from 'os';
import * as dns from 'dns';
import * as https from 'https';
import log from 'electron-log';

// MongoDB connection string for your specific database
const MONGODB_URI = 'mongodb+srv://unclesolutionssoftware:UncleSolutionsSoftware7@cluster0.vjnsmkp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0ter0';
const DATABASE_NAME = 'interview-coder';

export async function createVerificationWindow(): Promise<{ userId: string; name: string; email: string; openAIKey?: string; anthropicKey?: string } | null> {
  const verificationWindow = new BrowserWindow({
    width: 450,
    height: 350,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    frame: true,
    show: false,
    backgroundColor: '#000000'
  });

  // Enable DevTools for verification window (F12 key)
  verificationWindow.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12') {
      if (verificationWindow.webContents.isDevToolsOpened()) {
        verificationWindow.webContents.closeDevTools()
      } else {
        verificationWindow.webContents.openDevTools()
      }
    }
  });

  // Load the verification HTML from the public directory
  // In development, use the project's public directory
  // In production (packaged), use the app's resource path
  const isDev = process.env.NODE_ENV === 'development';
  let verificationHtmlPath: string;

  if (isDev) {
    verificationHtmlPath = path.join(__dirname, '../public/verification.html');
  } else {
    // In packaged app, extraResources are in the app's resource directory
    verificationHtmlPath = path.join(process.resourcesPath, 'public/verification.html');
  }

  console.log('Loading verification HTML from:', verificationHtmlPath);

  try {
    await verificationWindow.loadFile(verificationHtmlPath);
  } catch (error) {
    console.error('Failed to load verification HTML from primary path:', error);

    // Try fallback paths
    const fallbackPaths = [
      path.join(__dirname, '../public/verification.html'),
      path.join(__dirname, '../../public/verification.html'),
      path.join(process.cwd(), 'public/verification.html')
    ];

    let loaded = false;
    for (const fallbackPath of fallbackPaths) {
      try {
        console.log('Trying fallback path:', fallbackPath);
        await verificationWindow.loadFile(fallbackPath);
        loaded = true;
        break;
      } catch (fallbackError) {
        console.error('Fallback path failed:', fallbackPath, fallbackError);
      }
    }

    if (!loaded) {
      dialog.showErrorBox('Error', 'Failed to load verification window. Please try again.');
      verificationWindow.close();
      return null;
    }
  }
  verificationWindow.show();
  
  // Log instructions for accessing DevTools
  console.log('=== DEBUGGING INSTRUCTIONS ===');
  console.log('To see MongoDB connection logs in the verification window:');
  console.log('1. Click on the login dialog window');
  console.log('2. Press F12 to open Developer Tools');
  console.log('3. Go to Console tab');
  console.log('4. Try to login and watch the detailed error messages');
  console.log('================================');

  return new Promise((resolve) => {
    verificationWindow.webContents.on('did-finish-load', () => {
      // Enhanced injection with multiple fallback approaches
      verificationWindow.webContents.executeJavaScript(`
        console.log('Injecting electron communication...');
        
        // Try multiple approaches to set up IPC communication
        let ipcAvailable = false;
        
        // Approach 1: Direct electron object
        try {
          const { ipcRenderer } = require('electron');
          if (ipcRenderer) {
            window.electronIPC = {
              send: (channel, data) => ipcRenderer.send(channel, data),
              once: (channel, callback) => ipcRenderer.once(channel, callback)
            };
            ipcAvailable = true;
            console.log('Approach 1: Direct require worked');
          }
        } catch (e) {
          console.log('Approach 1 failed:', e.message);
        }
        
        // Approach 2: Global electron if available
        if (!ipcAvailable && typeof process !== 'undefined' && process.electronBinding) {
          try {
            const electronBinding = process.electronBinding('electron_renderer_ipc');
            if (electronBinding) {
              window.electronIPC = {
                send: electronBinding.send,
                once: electronBinding.once
              };
              ipcAvailable = true;
              console.log('Approach 2: electronBinding worked');
            }
          } catch (e) {
            console.log('Approach 2 failed:', e.message);
          }
        }
        
        // Approach 3: Create a bridge through the main process
        if (!ipcAvailable) {
          console.log('Creating IPC bridge through main process...');
          window.electronIPC = {
            send: (channel, data) => {
              console.log('Bridge send called for channel:', channel);
              // This will be handled by the main process
              window.postMessage({ type: 'ipc-send', channel, data }, '*');
            },
            once: (channel, callback) => {
              console.log('Bridge once called for channel:', channel);
              const handler = (event) => {
                if (event.data && event.data.type === 'ipc-response' && event.data.channel === channel) {
                  callback(event, event.data.result);
                  window.removeEventListener('message', handler);
                }
              };
              window.addEventListener('message', handler);
            }
          };
          ipcAvailable = true;
          console.log('Approach 3: Bridge created');
        }
        
        console.log('IPC setup complete, available:', ipcAvailable);
        return ipcAvailable;
      `).catch(error => {
        console.error('Error injecting electron communication:', error);
      });
    });

    // Handle credential verification
    ipcMain.on('verify-credentials', async (event, { email, password }) => {
      try {
        console.log('Attempting to connect to MongoDB...');
        console.log('Log files location:', log.transports.file.getFile().path);
        log.info('MongoDB connection attempt started');
        console.log('Email:', email);
        console.log('Database:', DATABASE_NAME);
        console.log('Environment:', process.env.NODE_ENV);
        console.log('App packaged:', process.resourcesPath ? true : false);
        console.log('Process cwd:', process.cwd());
        console.log('Process execPath:', process.execPath);
        console.log('__dirname:', __dirname);
        console.log('process.resourcesPath:', process.resourcesPath);

        const client = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 10000, // 10 second timeout
          connectTimeoutMS: 10000,
          socketTimeoutMS: 10000,
          maxPoolSize: 10,
          minPoolSize: 1,
          maxIdleTimeMS: 30000,
          waitQueueTimeoutMS: 5000,
        });
        
        await client.connect();
        console.log('Connected to MongoDB successfully');

        const db = client.db(DATABASE_NAME);
        const usersCollection = db.collection('users');

        // First, let's see all users in the collection for debugging
        const allUsers = await usersCollection.find({}).toArray();
        console.log('All users in collection:', allUsers.map(u => ({ email: u.email, name: u.name, hasPassword: !!u.password })));

        // Find user by email
        const user = await usersCollection.findOne({ email: email.toLowerCase() });
        console.log('Found user:', user ? {
          email: user.email,
          name: user.name,
          hasPassword: !!user.password,
          hasOpenAIKey: !!user.openAIKey,
          hasAnthropicKey: !!user.anthropicKey,
          openaiKeyPreview: user.openAIKey ? user.openAIKey.substring(0, 10) + '...' : 'No key',
          anthropicKeyPreview: user.anthropicKey ? user.anthropicKey.substring(0, 10) + '...' : 'No key'
        } : 'No user found');

        if (!user) {
          console.log('User not found with email:', email.toLowerCase());
          event.reply('verify-response', {
            success: false,
            message: 'Invalid email or password'
          });
          await client.close();
          return;
        }

        // Check if password is hashed or plain text
        console.log('User password (first 20 chars):', user.password ? user.password.substring(0, 20) : 'No password');

        let isValidPassword = false;

        // Try bcrypt comparison first
        if (user.password && user.password.startsWith('$2b$')) {
          console.log('Using bcrypt comparison');
          isValidPassword = await bcrypt.compare(password, user.password);
        } else {
          console.log('Using plain text comparison (not recommended for production)');
          isValidPassword = password === user.password;
        }

        console.log('Password valid:', isValidPassword);

        if (!isValidPassword) {
          event.reply('verify-response', {
            success: false,
            message: 'Invalid email or password'
          });
          await client.close();
          return;
        }

        // Successful authentication
        event.reply('verify-response', {
          success: true,
          user: {
            _id: user._id.toString(),
            name: user.name,
            email: user.email,
            openAIKey: user.openAIKey || null,
            anthropicKey: user.anthropicKey || null
          }
        });

        await client.close();
        console.log('Authentication successful');
      } catch (error) {
        console.error('=== MONGODB CONNECTION ERROR DETAILS ===');
        log.error('=== MONGODB CONNECTION ERROR DETAILS ===');
        console.error('Error type:', typeof error);
        console.error('Error name:', error.name || 'Unknown');
        console.error('Error message:', error.message || 'Unknown error');
        console.error('Error code:', error.code || 'No code');
        console.error('Error errno:', error.errno || 'No errno');
        console.error('Error syscall:', error.syscall || 'No syscall');
        console.error('Error hostname:', error.hostname || 'No hostname');
        console.error('Error stack:', error.stack || 'No stack trace');
        console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error('Network interfaces:', JSON.stringify(os.networkInterfaces(), null, 2));
        console.error('DNS servers:', JSON.stringify(dns.getServers(), null, 2));
        console.error('Environment NODE_ENV:', process.env.NODE_ENV);
        console.error('MongoDB URI (masked):', MONGODB_URI.replace(/:[^:@]*@/, ':***@'));
        log.error('Full MongoDB error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error('=== END ERROR DETAILS ===');
        log.error('=== END ERROR DETAILS ===');
        
        // Test basic connectivity
        console.log('Testing basic network connectivity...');
        try {
          const testReq = https.request('https://www.google.com', { timeout: 5000 }, () => {
            console.log('Basic HTTPS connectivity: OK');
          });
          testReq.on('error', (netErr: Error) => {
            console.error('Basic HTTPS connectivity failed:', netErr.message);
          });
          testReq.on('timeout', () => {
            console.error('Basic HTTPS connectivity: TIMEOUT');
          });
          testReq.end();
        } catch (netError) {
          console.error('Network test error:', netError instanceof Error ? netError.message : String(netError));
        }
        
        // Provide more specific error messages
        let errorMessage = 'Database connection error';
        if (error.message) {
          if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Cannot connect to database server. Please check your internet connection.';
          } else if (error.message.includes('authentication')) {
            errorMessage = 'Database authentication failed.';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'Database connection timeout. Please try again.';
          } else if (error.message.includes('getaddrinfo')) {
            errorMessage = 'DNS resolution failed. Please check your internet connection.';
          } else if (error.message.includes('certificate')) {
            errorMessage = 'SSL/TLS certificate error. This may be a network security issue.';
          } else {
            errorMessage = `Database error: ${error.message}`;
          }
        }
        
        // Create detailed debug information
        const debugInfo = [
          `=== MongoDB Connection Error Debug Info ===`,
          `Error Type: ${typeof error}`,
          `Error Name: ${error.name || 'Unknown'}`,
          `Error Message: ${error.message || 'Unknown error'}`,
          `Error Code: ${error.code || 'No code'}`,
          `Error Errno: ${error.errno || 'No errno'}`,
          `Error Syscall: ${error.syscall || 'No syscall'}`,
          `Error Hostname: ${error.hostname || 'No hostname'}`,
          `Environment: ${process.env.NODE_ENV}`,
          `App Packaged: ${process.resourcesPath ? 'Yes' : 'No'}`,
          `Process CWD: ${process.cwd()}`,
          `Process ExecPath: ${process.execPath}`,
          `__dirname: ${__dirname}`,
          `MongoDB URI: ${MONGODB_URI.replace(/:[^:@]*@/, ':***@')}`,
          `Network Interfaces: ${JSON.stringify(os.networkInterfaces(), null, 2)}`,
          `DNS Servers: ${JSON.stringify(dns.getServers(), null, 2)}`,
          `=== End Debug Info ===`
        ].join('\n');

        event.reply('verify-response', {
          success: false,
          message: errorMessage,
          debugInfo: debugInfo
        });
      }
    });

    // Handle successful verification
    ipcMain.once('verify-user', async (event, userData) => {
      try {
        // Store both API keys and let user choose provider via settings
        const currentConfig = configHelper.loadConfig();
        const updates: {
          openAIKey?: string;
          anthropicKey?: string;
          apiKey?: string;
          apiProvider?: 'openai' | 'anthropic';
        } = {};
        
        // Store both API keys in config if they exist
        if (userData.openAIKey) {
          console.log('OpenAI API key retrieved from user profile');
          updates.openAIKey = userData.openAIKey;
        }
        
        if (userData.anthropicKey) {
          console.log('Anthropic API key retrieved from user profile');
          updates.anthropicKey = userData.anthropicKey;
        }
        
        // Set the active API key and provider based on user's current preference or default
        const preferredProvider = currentConfig.apiProvider || 'openai'; // Default to OpenAI
        
        if (preferredProvider === 'openai' && userData.openAIKey) {
          updates.apiKey = userData.openAIKey;
          updates.apiProvider = 'openai';
          console.log('Using OpenAI as active provider');
        } else if (preferredProvider === 'anthropic' && userData.anthropicKey) {
          updates.apiKey = userData.anthropicKey;
          updates.apiProvider = 'anthropic';
          console.log('Using Anthropic as active provider');
        } else if (userData.openAIKey) {
          // Fallback to OpenAI if preferred provider not available
          updates.apiKey = userData.openAIKey;
          updates.apiProvider = 'openai';
          console.log('Falling back to OpenAI as active provider');
        } else if (userData.anthropicKey) {
          // Last resort - use Anthropic
          updates.apiKey = userData.anthropicKey;
          updates.apiProvider = 'anthropic';
          console.log('Using Anthropic as active provider (only option)');
        }
        
        configHelper.updateConfig(updates);

        verificationWindow.close();
        resolve({
          userId: userData.userId,
          name: userData.name,
          email: userData.email,
          openAIKey: userData.openAIKey,
          anthropicKey: userData.anthropicKey
        });
      } catch (error) {
        dialog.showErrorBox('Error', 'Failed to complete verification.');
        resolve(null);
      }
    });

    // Handle window closed without verification
    verificationWindow.on('closed', () => {
      resolve(null);
    });
  });
} 