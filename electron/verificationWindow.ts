import { BrowserWindow, dialog, ipcMain } from 'electron';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { configHelper } from './ConfigHelper';
import path from 'path';

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
      contextIsolation: false
    },
    frame: true,
    show: false,
    backgroundColor: '#000000'
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

  return new Promise((resolve) => {
    verificationWindow.webContents.on('did-finish-load', () => {
      // Expose the IPC renderer to the window
      verificationWindow.webContents.executeJavaScript(`
        window.electron = {
          ipcRenderer: {
            send: (channel, data) => {
              require('electron').ipcRenderer.send(channel, data);
            }
          }
        };
      `);

      // Expose the verifyUser function
      verificationWindow.webContents.executeJavaScript(`
        window.verifyUser = async (email, password) => {
          try {
            // Send the verification request to the main process
            return new Promise((resolve) => {
              const { ipcRenderer } = require('electron');
              
              // Listen for the response
              ipcRenderer.once('verify-response', (event, result) => {
                resolve(result);
              });
              
              // Send the verification request
              ipcRenderer.send('verify-credentials', { email, password });
            });
          } catch (error) {
            return { success: false, message: 'Error verifying credentials' };
          }
        };
      `);
    });

    // Handle credential verification
    ipcMain.on('verify-credentials', async (event, { email, password }) => {
      try {
        console.log('Attempting to connect to MongoDB...');
        console.log('Email:', email);
        console.log('Database:', DATABASE_NAME);
        console.log('Environment:', process.env.NODE_ENV);
        console.log('App packaged:', process.resourcesPath ? true : false);

        const client = new MongoClient(MONGODB_URI, {
          serverSelectionTimeoutMS: 10000, // 10 second timeout
          connectTimeoutMS: 10000,
          socketTimeoutMS: 10000,
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
        console.error('MongoDB verification error:', error);
        console.error('Error type:', typeof error);
        console.error('Error message:', error.message || 'Unknown error');
        console.error('Error stack:', error.stack || 'No stack trace');
        
        // Provide more specific error messages
        let errorMessage = 'Database connection error';
        if (error.message) {
          if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Cannot connect to database server. Please check your internet connection.';
          } else if (error.message.includes('authentication')) {
            errorMessage = 'Database authentication failed.';
          } else if (error.message.includes('timeout')) {
            errorMessage = 'Database connection timeout. Please try again.';
          } else {
            errorMessage = `Database error: ${error.message}`;
          }
        }
        
        event.reply('verify-response', {
          success: false,
          message: errorMessage
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