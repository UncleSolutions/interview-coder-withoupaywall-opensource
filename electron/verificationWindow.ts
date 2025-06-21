import { BrowserWindow, dialog, ipcMain } from 'electron';
import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import path from 'path';

// MongoDB connection string for your specific database
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://unclesolutionssoftware:UncleSolutionsSoftware7@cluster0.vjnsmkp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0ter0';
const DATABASE_NAME = 'interview-coder';

export async function createVerificationWindow(): Promise<{ userId: string; name: string; email: string } | null> {
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
  const verificationHtmlPath = path.join(__dirname, '../public/verification.html');
  verificationWindow.loadFile(verificationHtmlPath);
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
        
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('Connected to MongoDB successfully');
        
        const db = client.db(DATABASE_NAME);
        const usersCollection = db.collection('user');
        
        // First, let's see all users in the collection for debugging
        const allUsers = await usersCollection.find({}).toArray();
        console.log('All users in collection:', allUsers.map(u => ({ email: u.email, name: u.name, hasPassword: !!u.password })));
        
        // Find user by email
        const user = await usersCollection.findOne({ email: email.toLowerCase() });
        console.log('Found user:', user ? { email: user.email, name: user.name, hasPassword: !!user.password } : 'No user found');
        
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
            email: user.email
          }
        });
        
        await client.close();
        console.log('Authentication successful');
      } catch (error) {
        console.error('MongoDB verification error:', error);
        event.reply('verify-response', { 
          success: false, 
          message: 'Database connection error: ' + error.message 
        });
      }
    });

    // Handle successful verification
    ipcMain.once('verify-user', async (event, userData) => {
      try {
        verificationWindow.close();
        resolve({ 
          userId: userData.userId, 
          name: userData.name,
          email: userData.email 
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