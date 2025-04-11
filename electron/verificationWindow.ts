import { BrowserWindow, dialog, ipcMain } from 'electron';
import axios from 'axios';
import path from 'path';

export async function createVerificationWindow(): Promise<{ userId: string; name: string } | null> {
  const verificationWindow = new BrowserWindow({
    width: 400,
    height: 200,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: true,
    show: false
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
        window.verifyUser = async (userId) => {
          try {
            const response = await fetch('https://interview-coder-access-verify.vercel.app/verify-user/' + userId);
            const data = await response.json();
            return data;
          } catch (error) {
            return { exists: false, message: 'Error verifying user' };
          }
        };
      `);
    });

    // Handle verification through IPC
    ipcMain.once('verify-user', async (event, userId) => {
      try {
        const response = await axios.get(`https://interview-coder-access-verify.vercel.app/verify-user/${userId}`);
        const data = response.data;

        if (data.exists) {
          verificationWindow.close();
          resolve({ userId: data.user.userId, name: data.user.name });
        } else {
          dialog.showErrorBox('Verification Failed', data.message || 'Invalid user ID');
          verificationWindow.webContents.executeJavaScript('document.getElementById("userId").value = ""');
        }
      } catch (error) {
        dialog.showErrorBox('Error', 'Failed to verify user. Please try again.');
        verificationWindow.webContents.executeJavaScript('document.getElementById("userId").value = ""');
      }
    });
  });
} 