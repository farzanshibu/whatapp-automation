import pkg from 'whatsapp-web.js';
import type { Client as ClientType } from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import XLSX from 'xlsx';
import fs from 'fs';
import { EventEmitter } from 'events';
import { ExcelRow, MessageResult, ProgressData, CreateGroupResult, CreateGroupOptions } from './src/types.js';
import { execSync } from 'child_process';
import path from 'path';
import { app } from 'electron';
import puppeteer from 'puppeteer';

interface SendMessagesResults {
    total: number;
    success: number;
    failed: number;
    details: Array<{
        index: number;
        phone: string;
        status: 'success' | 'failed';
        error?: string;
    }>;
}

class WhatsAppHandler extends EventEmitter {
    private client: ClientType | null;
    private isReady: boolean;

    constructor() {
        super();
        this.client = null;
        this.isReady = false;
    }

    private async getChromiumPath(): Promise<string> {
        try {
            // Use puppeteer's bundled Chromium
            // Launch a browser instance to ensure Chromium is downloaded
            const browser = await puppeteer.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const chromiumPath = browser.process()?.spawnfile || '';
            await browser.close();
            
            if (chromiumPath && fs.existsSync(chromiumPath)) {
                console.log('Using puppeteer bundled Chromium at:', chromiumPath);
                return chromiumPath;
            }
            
            // If we can't get the path, fallback to system Chrome
            console.log('Could not get Chromium path from puppeteer, trying system Chrome');
            return this.findSystemChrome();
        } catch (error) {
            console.error('Error getting Chromium from puppeteer:', error);
            // Fallback to system Chrome if puppeteer fails
            return this.findSystemChrome();
        }
    }

    private findSystemChrome(): string {
        try {
            const platform = process.platform;
            let possiblePaths: string[] = [];

            if (platform === 'darwin') {
                // macOS paths
                possiblePaths = [
                    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                    '/Applications/Chromium.app/Contents/MacOS/Chromium',
                    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
                ];
            } else if (platform === 'win32') {
                // Windows paths
                const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
                const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
                const localAppData = process.env['LOCALAPPDATA'] || path.join(process.env['USERPROFILE'] || '', 'AppData', 'Local');

                possiblePaths = [
                    path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
                    path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
                    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
                    path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
                    path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
                    path.join(programFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
                    path.join(programFilesX86, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
                    path.join(localAppData, 'Chromium\\Application\\chrome.exe')
                ];
            } else {
                // Linux paths
                possiblePaths = [
                    '/usr/bin/google-chrome',
                    '/usr/bin/chromium',
                    '/usr/bin/chromium-browser',
                    '/snap/bin/chromium',
                    '/usr/bin/microsoft-edge'
                ];
            }

            for (const chromePath of possiblePaths) {
                if (fs.existsSync(chromePath)) {
                    console.log('Found system browser at:', chromePath);
                    return chromePath;
                }
            }

            // Try to use command to find chrome (works on macOS/Linux)
            if (platform !== 'win32') {
                try {
                    const result = execSync('which google-chrome-stable || which chromium || which google-chrome', { encoding: 'utf8' }).trim();
                    if (result && fs.existsSync(result)) {
                        console.log('Found browser via which:', result);
                        return result;
                    }
                } catch (e) {
                    // Ignore error
                }
            }
        } catch (error) {
            console.error('Error finding Chrome:', error);
        }
        return '';
    }

    async initialize(): Promise<void> {
        console.log('Initializing WhatsApp client...');
        console.log('App is packaged:', app.isPackaged);
        console.log('User data path:', app.getPath('userData'));
        
        // Get Chromium path from puppeteer (downloads if needed)
        const chromiumPath = await this.getChromiumPath();
        console.log('Chromium path to use:', chromiumPath);
        
        const puppeteerConfig: any = {
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        };

        if (chromiumPath) {
            puppeteerConfig.executablePath = chromiumPath;
        }

        // Use userData path for auth storage - works in both dev and production
        const authPath = path.join(app.getPath('userData'), 'wwebjs_auth');
        console.log('Auth path:', authPath);
        
        // Ensure the directory exists
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: authPath
            }),
            puppeteer: puppeteerConfig
        });

        this.client.on('qr', (qr: string) => {
            console.log('QR code received');
            this.emit('qr', qr);
        });

        this.client.on('authenticated', () => {
            console.log('Authenticated!');
            this.emit('authenticated');
        });

        this.client.on('ready', () => {
            this.isReady = true;
            this.emit('ready');
        });

        this.client.on('auth_failure', (msg: string) => {
            this.emit('auth_failure', msg);
        });

        this.client.on('disconnected', (reason: string) => {
            this.isReady = false;
            this.emit('disconnected', reason);
        });

        await this.client.initialize();

        // Wait for ready state
        return new Promise<void>((resolve) => {
            const checkReady = setInterval(() => {
                if (this.isReady) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 1000);
        });
    }

    getExcelSheets(filePath: string): string[] {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const workbook = XLSX.readFile(filePath);
        return workbook.SheetNames;
    }

    readExcelFile(filePath: string, sheetName: string | null = null): ExcelRow[] {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const workbook = XLSX.readFile(filePath, { cellDates: true, dateNF: 'yyyy-mm-dd', cellText: false, cellNF: true });
        const selectedSheet = sheetName || workbook.SheetNames[0];
        
        if (!workbook.SheetNames.includes(selectedSheet)) {
            throw new Error(`Sheet '${selectedSheet}' not found in workbook`);
        }

        const worksheet = workbook.Sheets[selectedSheet];
        
        // Convert with raw: true to get actual values, then format them properly
        const data = XLSX.utils.sheet_to_json(worksheet, { 
            raw: true,
            defval: ''
        }) as ExcelRow[];

        // Add row indices and format large numbers as strings
        return data.map((row, index) => {
            const formattedRow: ExcelRow = { __rowIndex: index };
            
            for (const key in row) {
                const value = row[key];
                // If it's a number larger than 999999999 (likely a phone number), convert to string
                if (typeof value === 'number' && value > 999999999) {
                    formattedRow[key] = Math.floor(value).toString();
                } else if (value instanceof Date) {
                    formattedRow[key] = value;
                } else {
                    formattedRow[key] = value;
                }
            }
            
            return formattedRow;
        });
    }

    formatMessage(template: string, rowData: ExcelRow): string {
        let message = template;
        
        Object.keys(rowData).forEach(column => {
            const placeholder = `{${column}}`;
            let value = '';
            
            if (rowData[column] !== undefined && rowData[column] !== null) {
                const cellValue = rowData[column];
                // Handle dates
                if (cellValue instanceof Date) {
                    value = cellValue.toLocaleDateString();
                } else {
                    value = cellValue.toString();
                }
            }
            
            message = message.split(placeholder).join(value);
        });

        return message;
    }

    formatPhoneNumber(phone: string | number): string {
        const cleaned = phone.toString().replace(/\D/g, '');
        return cleaned + '@c.us';
    }

    async sendMessage(phone: string | number, message: string): Promise<MessageResult> {
        try {
            if (!this.client) {
                throw new Error('WhatsApp client not initialized');
            }
            const chatId = this.formatPhoneNumber(phone);
            await this.client.sendMessage(chatId, message);
            return { phone: phone.toString(), status: 'success' };
        } catch (error) {
            return { 
                phone: phone.toString(), 
                status: 'failed', 
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async sendMessages(
        data: ExcelRow[], 
        phoneColumn: string, 
        template: string, 
        delay: number, 
        progressCallback?: (progress: ProgressData) => void
    ): Promise<SendMessagesResults> {
        const results: SendMessagesResults = {
            total: data.length,
            success: 0,
            failed: 0,
            details: []
        };

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const phone = row[phoneColumn];
            
            if (!phone || phone instanceof Date) {
                results.failed++;
                results.details.push({
                    index: i,
                    phone: 'N/A',
                    status: 'failed',
                    error: 'No phone number'
                });
                
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: data.length,
                        phone: 'N/A',
                        status: 'failed',
                        error: 'No phone number'
                    });
                }
                continue;
            }

            const message = this.formatMessage(template, row);
            
            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: data.length,
                    phone: typeof phone === 'string' || typeof phone === 'number' ? phone.toString() : String(phone),
                    status: 'sending'
                });
            }

            const phoneValue = typeof phone === 'string' || typeof phone === 'number' ? phone : String(phone);
            const result = await this.sendMessage(phoneValue, message);
            
            if (result.status === 'success') {
                results.success++;
                results.details.push({
                    index: i,
                    phone: phone.toString(),
                    status: 'success'
                });

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: data.length,
                        phone: phone.toString(),
                        status: 'success'
                    });
                }
            } else {
                results.failed++;
                results.details.push({
                    index: i,
                    phone: phone.toString(),
                    status: 'failed',
                    error: result.error
                });

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: data.length,
                        phone: phone.toString(),
                        status: 'failed',
                        error: result.error
                    });
                }
            }

            // Delay between messages (except for last message)
            if (i < data.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        return results;
    }

    async createGroupFromExcel(
        filePath: string,
        sheetName: string | null,
        phoneColumn: string,
        groupName: string
    ): Promise<CreateGroupResult> {
        try {
            if (!this.client) {
                throw new Error('WhatsApp client not initialized');
            }

            // Read Excel data
            const data = this.readExcelFile(filePath, sheetName);

            // Extract and format phone numbers
            const participants: string[] = [];
            for (const row of data) {
                const phone = row[phoneColumn];
                if (phone && !(phone instanceof Date)) {
                    const formattedPhone = this.formatPhoneNumber(phone);
                    participants.push(formattedPhone);
                }
            }

            if (participants.length === 0) {
                throw new Error('No valid phone numbers found in the Excel file');
            }

            // Create the group
            const group = await this.client.createGroup(groupName, participants) as any;

            return {
                success: true,
                groupId: group.id._serialized,
                groupName: group.name
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred while creating group'
            };
        }
    }

    async destroy(): Promise<void> {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.isReady = false;
        }
    }
}

export default WhatsAppHandler;
