import pkg from 'whatsapp-web.js';
import type { Client as ClientType } from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import * as qrcode from 'qrcode-terminal';
import XLSX from 'xlsx';
import * as readlineSync from 'readline-sync';
import * as fs from 'fs';

interface ExcelRow {
    [key: string]: any;
}

interface SendResult {
    success: boolean;
    error?: string;
}

class WhatsAppAutomation {
    private client: ClientType | null;
    private isReady: boolean;

    constructor() {
        this.client = null;
        this.isReady = false;
    }

    /**
     * Initialize WhatsApp client with authentication
     */
    async initialize(): Promise<void> {
        console.log('\n=== WhatsApp Automation Tool ===\n');
        console.log('Initializing WhatsApp client...\n');

        // Create client with local authentication to persist session
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: false,
                args: ['--no-sandbox']
            }
        });

        // Handle QR code generation
        this.client.on('qr', (qr: string) => {
            console.log('\nPlease scan this QR code with your phone:\n');
            qrcode.generate(qr, { small: true });
            console.log('\nOpen WhatsApp on your phone > Settings > Linked Devices > Link a Device');
        });

        // Handle authentication
        this.client.on('authenticated', () => {
            console.log('\n✓ Authentication successful!');
        });

        // Handle ready state
        this.client.on('ready', () => {
            console.log('\n✓ WhatsApp client is ready!');
            this.isReady = true;
        });

        // Handle authentication failure
        this.client.on('auth_failure', (msg: string) => {
            console.error('\n✗ Authentication failure:', msg);
            process.exit(1);
        });

        // Handle disconnection
        this.client.on('disconnected', (reason: string) => {
            console.log('\n⚠ Client was disconnected:', reason);
        });

        // Initialize the client
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

    /**
     * Read Excel file and return data as array of objects
     */
    readExcelFile(filePath: string): ExcelRow[] {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            console.log(`\nReading Excel file: ${filePath}`);
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet) as ExcelRow[];

            console.log(`✓ Loaded ${data.length} rows from Excel file`);
            
            // Display column names
            if (data.length > 0) {
                console.log('\nAvailable columns:');
                Object.keys(data[0]).forEach((col, index) => {
                    console.log(`  ${index + 1}. ${col}`);
                });
            }

            return data;
        } catch (error) {
            console.error(`\n✗ Error reading Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Format message template with row data
     */
    formatMessage(template: string, rowData: ExcelRow): string {
        let message = template;
        
        // Replace all {ColumnName} placeholders with actual values
        Object.keys(rowData).forEach(column => {
            const placeholder = `{${column}}`;
            const value = rowData[column] !== undefined && rowData[column] !== null 
                ? rowData[column].toString() 
                : '';
            message = message.split(placeholder).join(value);
        });

        return message;
    }

    /**
     * Format phone number for WhatsApp (add country code if needed)
     */
    formatPhoneNumber(phone: string | number): string {
        // Remove all non-digit characters
        const cleaned = phone.toString().replace(/\D/g, '');
        
        // If number doesn't start with country code, you might want to add one
        // This example assumes numbers are already in correct format
        // Adjust based on your needs
        
        return cleaned + '@c.us';
    }

    /**
     * Send a message to a WhatsApp number
     */
    async sendMessage(phone: string | number, message: string): Promise<SendResult> {
        try {
            if (!this.client) {
                throw new Error('WhatsApp client not initialized');
            }
            const chatId = this.formatPhoneNumber(phone);
            await this.client.sendMessage(chatId, message);
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Main automation flow
     */
    async run(): Promise<void> {
        try {
            // Initialize WhatsApp client
            await this.initialize();

            console.log('\n\n=== Starting Message Campaign ===\n');

            // Get Excel file path
            const defaultPath = './contacts.xlsx';
            const filePath = readlineSync.question(
                `Enter Excel file path (press Enter for '${defaultPath}'): `
            ) || defaultPath;

            // Read Excel data
            const data = this.readExcelFile(filePath);

            if (data.length === 0) {
                console.log('\n✗ No data found in Excel file');
                process.exit(0);
            }

            // Get phone column
            const columns = Object.keys(data[0]);
            console.log('\nWhich column contains phone numbers?');
            const phoneColumnIndex = readlineSync.questionInt('Enter column number: ') - 1;
            
            if (phoneColumnIndex < 0 || phoneColumnIndex >= columns.length) {
                console.log('\n✗ Invalid column number');
                process.exit(1);
            }

            const phoneColumn = columns[phoneColumnIndex];
            console.log(`✓ Using column: ${phoneColumn}`);

            // Get message template
            console.log('\n\nEnter your message template.');
            console.log('Use column names in curly braces for placeholders.');
            console.log('Example: Hello {Name}, your balance is {Balance}');
            console.log('\nPress Enter twice when done:\n');

            let template = '';
            let line = '';
            let emptyLineCount = 0;

            while (emptyLineCount < 1) {
                line = readlineSync.question('');
                if (line === '') {
                    emptyLineCount++;
                } else {
                    if (template) template += '\n';
                    template += line;
                    emptyLineCount = 0;
                }
            }

            if (!template.trim()) {
                console.log('\n✗ Message template cannot be empty');
                process.exit(1);
            }

            console.log('\n✓ Message template saved');

            // Get delay between messages
            const delay = readlineSync.questionInt(
                '\nDelay between messages in seconds (default 5): ',
                { defaultInput: '5' }
            );

            // Confirm before sending
            console.log('\n\n=== Summary ===');
            console.log(`Total messages to send: ${data.length}`);
            console.log(`Phone column: ${phoneColumn}`);
            console.log(`Delay: ${delay} seconds`);
            console.log(`\nMessage template:\n${template}\n`);

            const confirm = readlineSync.keyInYN('\nDo you want to proceed?');
            
            if (!confirm) {
                console.log('\n✗ Operation cancelled');
                process.exit(0);
            }

            // Send messages
            console.log('\n\n=== Sending Messages ===\n');
            
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const phone = row[phoneColumn];
                
                if (!phone) {
                    console.log(`[${i + 1}/${data.length}] ✗ Skipping row - no phone number`);
                    failCount++;
                    continue;
                }

                const message = this.formatMessage(template, row);
                
                console.log(`[${i + 1}/${data.length}] Sending to ${phone}...`);
                
                const result = await this.sendMessage(phone, message);
                
                if (result.success) {
                    console.log(`[${i + 1}/${data.length}] ✓ Sent successfully`);
                    successCount++;
                } else {
                    console.log(`[${i + 1}/${data.length}] ✗ Failed: ${result.error}`);
                    failCount++;
                }

                // Delay before next message (except for last message)
                if (i < data.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
            }

            // Summary
            console.log('\n\n=== Campaign Complete ===');
            console.log(`✓ Successfully sent: ${successCount}`);
            console.log(`✗ Failed: ${failCount}`);
            console.log(`Total: ${data.length}\n`);

        } catch (error) {
            console.error('\n✗ An error occurred:', error instanceof Error ? error.message : 'Unknown error');
            if (error instanceof Error) {
                console.error(error.stack);
            }
        } finally {
            // Close the client
            if (this.client) {
                await this.client.destroy();
            }
            process.exit(0);
        }
    }
}

// Run the automation
const automation = new WhatsAppAutomation();
automation.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
