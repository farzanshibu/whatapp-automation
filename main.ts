import { app, BrowserWindow, ipcMain, dialog, IpcMainInvokeEvent } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import WhatsAppHandler from './whatsapp-handler.js';
import { ExcelRow, SendMessagesOptions, ProgressData } from './src/types.js';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null;
let whatsappHandler: WhatsAppHandler | null;

// Get the correct base path for resources
function getResourcePath(...paths: string[]): string {
    if (app.isPackaged) {
        // In production: resources are in the app root (where package.json is)
        return path.join(process.resourcesPath, 'app', ...paths);
    } else {
        // In development: go up from dist to project root
        return path.join(__dirname, '..', ...paths);
    }
}

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: getResourcePath('assets', 'icon.png')
    });

    // Load the built React app
    const indexPath = getResourcePath('dist-react', 'index.html');
    console.log('Loading index from:', indexPath);
    mainWindow.loadFile(indexPath);

    // Open DevTools in development
    if (!app.isPackaged) {
        // mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
    // Cleanup WhatsApp handler before quitting
    if (whatsappHandler) {
        try {
            await whatsappHandler.destroy();
        } catch (error) {
            console.error('Error destroying WhatsApp handler:', error);
        }
        whatsappHandler = null;
    }
    
    // Quit on all platforms (including macOS in this case since it's not a standard app)
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Graceful shutdown on process termination
process.on('SIGTERM', async () => {
    if (whatsappHandler) {
        await whatsappHandler.destroy();
    }
    app.quit();
});

process.on('SIGINT', async () => {
    if (whatsappHandler) {
        await whatsappHandler.destroy();
    }
    app.quit();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    // Show error dialog to user
    if (mainWindow) {
        dialog.showErrorBox('Application Error', `An error occurred: ${error.message}`);
    }
});

// Handle file selection
ipcMain.handle('select-file', async (): Promise<string | null> => {
    if (!mainWindow) return null;
    
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// Initialize WhatsApp
ipcMain.handle('init-whatsapp', async (): Promise<{ success: boolean; error?: string }> => {
    try {
        console.log('Init WhatsApp handler...');
        whatsappHandler = new WhatsAppHandler();
        
        if (!mainWindow) {
            throw new Error('Main window not initialized');
        }

        // Forward events to renderer
        whatsappHandler.on('qr', (qr: string) => {
            console.log('Forwarding QR to renderer');
            mainWindow?.webContents.send('whatsapp-qr', qr);
        });

        whatsappHandler.on('authenticated', () => {
            console.log('Forwarding authenticated to renderer');
            mainWindow?.webContents.send('whatsapp-authenticated');
        });

        whatsappHandler.on('ready', () => {
            console.log('Forwarding ready to renderer');
            mainWindow?.webContents.send('whatsapp-ready');
        });

        whatsappHandler.on('auth_failure', (msg: string) => {
            console.log('Auth failure:', msg);
            mainWindow?.webContents.send('whatsapp-auth-failure', msg);
        });

        whatsappHandler.on('disconnected', (reason: string) => {
            console.log('Disconnected:', reason);
            mainWindow?.webContents.send('whatsapp-disconnected', reason);
        });

        console.log('Starting WhatsApp initialization...');
        await whatsappHandler.initialize();
        console.log('WhatsApp initialization complete');
        return { success: true };
    } catch (error) {
        console.error('Error in init-whatsapp:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});

// Read Excel file
ipcMain.handle('get-excel-sheets', async (_: IpcMainInvokeEvent, filePath: string): Promise<{ success: boolean; sheets?: string[]; error?: string }> => {
    try {
        if (!whatsappHandler) {
            throw new Error('WhatsApp handler not initialized');
        }
        const sheets = whatsappHandler.getExcelSheets(filePath);
        return { success: true, sheets };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});

ipcMain.handle('read-excel', async (_: IpcMainInvokeEvent, filePath: string, sheetName?: string): Promise<{ success: boolean; data?: ExcelRow[]; error?: string }> => {
    try {
        if (!whatsappHandler) {
            throw new Error('WhatsApp handler not initialized');
        }
        const data = whatsappHandler.readExcelFile(filePath, sheetName || null);
        return { success: true, data };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});

// Send messages
ipcMain.handle('send-messages', async (_: IpcMainInvokeEvent, options: SendMessagesOptions): Promise<{ success: boolean; results?: any; error?: string }> => {
    try {
        if (!whatsappHandler) {
            throw new Error('WhatsApp handler not initialized');
        }

        const { data, phoneColumn, template, delay } = options;

        const results = await whatsappHandler.sendMessages(
            data,
            phoneColumn,
            template,
            delay,
            (progress: ProgressData) => {
                mainWindow?.webContents.send('send-progress', progress);
            }
        );

        return { success: true, results };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});

// Create group
ipcMain.handle('create-group', async (_: IpcMainInvokeEvent, options: { filePath: string; sheetName: string | null; phoneColumn: string; groupName: string }): Promise<{ success: boolean; groupId?: string; groupName?: string; error?: string }> => {
    try {
        if (!whatsappHandler) {
            throw new Error('WhatsApp handler not initialized');
        }

        const { filePath, sheetName, phoneColumn, groupName } = options;

        const result = await whatsappHandler.createGroupFromExcel(
            filePath,
            sheetName,
            phoneColumn,
            groupName
        );

        return result;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});

// Disconnect WhatsApp
ipcMain.handle('disconnect-whatsapp', async (): Promise<{ success: boolean; error?: string }> => {
    try {
        if (whatsappHandler) {
            await whatsappHandler.destroy();
            whatsappHandler = null;
        }
        return { success: true };
    } catch (error) {
        return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
});
