const { Client, LocalAuth } = require('whatsapp-web.js');
const XLSX = require('xlsx');
const fs = require('fs');
const EventEmitter = require('events');

class WhatsAppHandler extends EventEmitter {
    constructor() {
        super();
        this.client = null;
        this.isReady = false;
    }

    async initialize() {
        console.log('Initializing WhatsApp client...');
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: false,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.client.on('qr', (qr) => {
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

        this.client.on('auth_failure', (msg) => {
            this.emit('auth_failure', msg);
        });

        this.client.on('disconnected', (reason) => {
            this.isReady = false;
            this.emit('disconnected', reason);
        });

        await this.client.initialize();

        // Wait for ready state
        return new Promise((resolve) => {
            const checkReady = setInterval(() => {
                if (this.isReady) {
                    clearInterval(checkReady);
                    resolve();
                }
            }, 1000);
        });
    }

    getExcelSheets(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const workbook = XLSX.readFile(filePath);
        return workbook.SheetNames;
    }

    readExcelFile(filePath, sheetName = null) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const workbook = XLSX.readFile(filePath, { cellDates: true, dateNF: 'yyyy-mm-dd' });
        const selectedSheet = sheetName || workbook.SheetNames[0];
        
        if (!workbook.SheetNames.includes(selectedSheet)) {
            throw new Error(`Sheet '${selectedSheet}' not found in workbook`);
        }

        const worksheet = workbook.Sheets[selectedSheet];
        const data = XLSX.utils.sheet_to_json(worksheet, { 
            raw: false,
            defval: '',
            dateNF: 'yyyy-mm-dd'
        });

        // Add row indices to data
        return data.map((row, index) => ({
            ...row,
            __rowIndex: index
        }));
    }

    formatMessage(template, rowData) {
        let message = template;
        
        Object.keys(rowData).forEach(column => {
            const placeholder = `{${column}}`;
            let value = '';
            
            if (rowData[column] !== undefined && rowData[column] !== null) {
                // Handle dates
                if (rowData[column] instanceof Date) {
                    value = rowData[column].toLocaleDateString();
                } else {
                    value = rowData[column].toString();
                }
            }
            
            message = message.split(placeholder).join(value);
        });

        return message;
    }

    formatPhoneNumber(phone) {
        let cleaned = phone.toString().replace(/\D/g, '');
        return cleaned + '@c.us';
    }

    async sendMessage(phone, message) {
        try {
            const chatId = this.formatPhoneNumber(phone);
            await this.client.sendMessage(chatId, message);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sendMessages(data, phoneColumn, template, delay, progressCallback) {
        const results = {
            total: data.length,
            success: 0,
            failed: 0,
            details: []
        };

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const phone = row[phoneColumn];
            
            if (!phone) {
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
                    phone: phone,
                    status: 'sending',
                    message: message
                });
            }

            const result = await this.sendMessage(phone, message);
            
            if (result.success) {
                results.success++;
                results.details.push({
                    index: i,
                    phone: phone,
                    status: 'success'
                });

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: data.length,
                        phone: phone,
                        status: 'success'
                    });
                }
            } else {
                results.failed++;
                results.details.push({
                    index: i,
                    phone: phone,
                    status: 'failed',
                    error: result.error
                });

                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: data.length,
                        phone: phone,
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

    async destroy() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
            this.isReady = false;
        }
    }
}

module.exports = WhatsAppHandler;
