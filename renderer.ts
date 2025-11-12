import { IpcRenderer } from 'electron';
import * as QRCode from 'qrcode';
import { ExcelRow, ProgressData } from './src/types';

interface IpcRendererWithInvoke extends IpcRenderer {
  invoke(channel: string, ...args: any[]): Promise<any>;
}

interface SendMessagesResult {
  success: boolean;
  results?: {
    success: number;
    failed: number;
    total: number;
  };
  error?: string;
}

interface ReadExcelResult {
  success: boolean;
  data?: ExcelRow[];
  error?: string;
}

declare global {
  interface Window {
    require: (module: 'electron') => { ipcRenderer: IpcRendererWithInvoke };
  }
}

const { ipcRenderer } = window.require('electron');

// State
let excelData: ExcelRow[] | null = null;
let selectedFile: string | null = null;
let isConnected = false;

// DOM Elements
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement;
const browseBtn = document.getElementById('browse-btn') as HTMLButtonElement;
const filePathInput = document.getElementById('file-path') as HTMLInputElement;
const phoneColumnSelect = document.getElementById('phone-column') as HTMLSelectElement;
const messageTemplate = document.getElementById('message-template') as HTMLTextAreaElement;
const delayInput = document.getElementById('delay') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const connectionStatus = document.getElementById('connection-status') as HTMLElement;
const qrContainer = document.getElementById('qr-container') as HTMLElement;
const qrCodeDiv = document.getElementById('qr-code') as HTMLElement;
const connectionMessage = document.getElementById('connection-message') as HTMLElement;
const dataPreview = document.getElementById('data-preview') as HTMLElement;
const previewHeader = document.getElementById('preview-header') as HTMLTableSectionElement;
const previewBody = document.getElementById('preview-body') as HTMLTableSectionElement;
const rowCount = document.getElementById('row-count') as HTMLElement;
const availableColumns = document.getElementById('available-columns') as HTMLElement;
const summary = document.getElementById('summary') as HTMLElement;
const progressSection = document.getElementById('progress-section') as HTMLElement;
const progressBar = document.getElementById('progress-bar') as HTMLElement;
const progressText = document.getElementById('progress-text') as HTMLElement;
const progressLog = document.getElementById('progress-log') as HTMLElement;
const results = document.getElementById('results') as HTMLElement;

// Event Listeners
connectBtn.addEventListener('click', initializeWhatsApp);
browseBtn.addEventListener('click', selectFile);
sendBtn.addEventListener('click', sendMessages);

phoneColumnSelect.addEventListener('change', updateSummary);
messageTemplate.addEventListener('input', updateSummary);
delayInput.addEventListener('input', updateSummary);

// WhatsApp Event Handlers
ipcRenderer.on('whatsapp-qr', (_event: any, qr: string) => {
    showQRCode(qr);
    updateConnectionStatus('Scan QR Code', 'warning');
    showMessage('Please scan the QR code with your phone', 'info');
});

ipcRenderer.on('whatsapp-authenticated', () => {
    updateConnectionStatus('Authenticated', 'info');
    showMessage('Authentication successful!', 'success');
});

ipcRenderer.on('whatsapp-ready', () => {
    isConnected = true;
    updateConnectionStatus('Connected', 'success');
    showMessage('WhatsApp is ready! You can now select an Excel file.', 'success');
    qrContainer.style.display = 'none';
    connectBtn.disabled = true;
    connectBtn.textContent = '✓ Connected';
    connectBtn.classList.add('btn-success');
    browseBtn.disabled = false;
});

ipcRenderer.on('whatsapp-auth-failure', (_event: any, msg: string) => {
    updateConnectionStatus('Failed', 'error');
    showMessage(`Authentication failed: ${msg}`, 'error');
    connectBtn.disabled = false;
});

ipcRenderer.on('whatsapp-disconnected', (_event: any, reason: string) => {
    isConnected = false;
    updateConnectionStatus('Disconnected', 'error');
    showMessage(`Disconnected: ${reason}`, 'warning');
    connectBtn.disabled = false;
    connectBtn.textContent = '🔌 Reconnect WhatsApp';
    connectBtn.classList.remove('btn-success');
});

ipcRenderer.on('send-progress', (_event: any, progress: ProgressData) => {
    updateProgress(progress);
});

// Functions
async function initializeWhatsApp(): Promise<void> {
    try {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
        showMessage('Initializing WhatsApp Web...', 'info');
        
        const result = await ipcRenderer.invoke('init-whatsapp');
        
        if (!result.success) {
            showMessage(`Failed to initialize: ${result.error}`, 'error');
            connectBtn.disabled = false;
            connectBtn.textContent = '🔌 Connect WhatsApp';
        }
    } catch (error) {
        console.error('Error initializing WhatsApp:', error);
        showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        connectBtn.disabled = false;
        connectBtn.textContent = '🔌 Connect WhatsApp';
    }
}

function showQRCode(qr: string): void {
    qrContainer.style.display = 'block';
    qrCodeDiv.innerHTML = '';
    
    QRCode.toCanvas(qr, { width: 300, margin: 2 }, (error, canvas) => {
        if (error) {
            console.error(error);
            qrCodeDiv.innerHTML = '<p style="color: red;">Failed to generate QR code</p>';
        } else {
            qrCodeDiv.appendChild(canvas);
        }
    });
}

function updateConnectionStatus(text: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    connectionStatus.textContent = text;
    connectionStatus.className = 'status-badge status-' + type;
}

function showMessage(text: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    connectionMessage.textContent = text;
    connectionMessage.className = 'message message-' + type;
}

// Helper function to format cell values
function formatCellValue(value: string | number | Date | undefined | null): string {
    if (value === null || value === undefined) {
        return '';
    }
    
    // Check if it's a date string in ISO format
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString();
            }
        } catch (e) {
            // If date parsing fails, return original value
        }
    }
    
    // Check if it's a Date object
    if (value instanceof Date) {
        return value.toLocaleDateString();
    }
    
    return value.toString();
}

async function selectFile(): Promise<void> {
    const filePath = await ipcRenderer.invoke('select-file') as string | null;
    
    if (filePath) {
        selectedFile = filePath;
        filePathInput.value = filePath;
        
        // Read Excel file
        const result: ReadExcelResult = await ipcRenderer.invoke('read-excel', filePath);
        
        if (result.success && result.data) {
            excelData = result.data;
            displayDataPreview(result.data);
            enableConfiguration(result.data);
        } else {
            alert(`Failed to read Excel file: ${result.error}`);
        }
    }
}

function displayDataPreview(data: ExcelRow[]): void {
    if (data.length === 0) {
        alert('The Excel file is empty!');
        return;
    }

    const columns = Object.keys(data[0]);
    
    // Create header
    previewHeader.innerHTML = '';
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    previewHeader.appendChild(headerRow);
    
    // Create body (show first 5 rows)
    previewBody.innerHTML = '';
    const previewRows = data.slice(0, 5);
    previewRows.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => {
            const td = document.createElement('td');
            td.textContent = formatCellValue(row[col]);
            tr.appendChild(td);
        });
        previewBody.appendChild(tr);
    });
    
    rowCount.textContent = data.length.toString();
    dataPreview.style.display = 'block';
}

function enableConfiguration(data: ExcelRow[]): void {
    const columns = Object.keys(data[0]);
    
    // Populate phone column dropdown
    phoneColumnSelect.innerHTML = '<option value="">Select column...</option>';
    columns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        phoneColumnSelect.appendChild(option);
    });
    
    // Auto-select if there's a column with 'phone' in the name
    const phoneCol = columns.find(col => col.toLowerCase().includes('phone'));
    if (phoneCol) {
        phoneColumnSelect.value = phoneCol;
    }
    
    // Show available columns
    availableColumns.innerHTML = '<strong>Available columns:</strong> ' + 
        columns.map(col => `<code>{${col}}</code>`).join(', ');
    
    // Enable inputs
    phoneColumnSelect.disabled = false;
    messageTemplate.disabled = false;
    delayInput.disabled = false;
    
    updateSummary();
}

function updateSummary(): void {
    if (!excelData || !phoneColumnSelect.value || !messageTemplate.value.trim()) {
        summary.style.display = 'none';
        sendBtn.disabled = true;
        return;
    }
    
    summary.style.display = 'block';
    sendBtn.disabled = false;
    
    const summaryTotal = document.getElementById('summary-total');
    const summaryPhoneCol = document.getElementById('summary-phone-col');
    const summaryDelay = document.getElementById('summary-delay');
    
    if (summaryTotal) summaryTotal.textContent = excelData.length.toString();
    if (summaryPhoneCol) summaryPhoneCol.textContent = phoneColumnSelect.value;
    if (summaryDelay) summaryDelay.textContent = delayInput.value;
}

async function sendMessages(): Promise<void> {
    if (!excelData || !phoneColumnSelect.value || !messageTemplate.value.trim()) {
        alert('Please fill in all required fields!');
        return;
    }
    
    const confirmSend = confirm(
        `Are you sure you want to send ${excelData.length} messages?\n\n` +
        `Phone column: ${phoneColumnSelect.value}\n` +
        `Delay: ${delayInput.value} seconds`
    );
    
    if (!confirmSend) return;
    
    // Disable controls
    sendBtn.disabled = true;
    phoneColumnSelect.disabled = true;
    messageTemplate.disabled = true;
    delayInput.disabled = true;
    browseBtn.disabled = true;
    
    // Show progress section
    progressSection.style.display = 'block';
    results.style.display = 'none';
    progressLog.innerHTML = '';
    progressBar.style.width = '0%';
    progressText.textContent = '0 / ' + excelData.length + ' messages sent';
    
    // Send messages
    const result: SendMessagesResult = await ipcRenderer.invoke('send-messages', {
        data: excelData,
        phoneColumn: phoneColumnSelect.value,
        template: messageTemplate.value,
        delay: parseInt(delayInput.value)
    });
    
    if (result.success && result.results) {
        showResults(result.results);
    } else {
        alert(`Failed to send messages: ${result.error}`);
        // Re-enable controls
        sendBtn.disabled = false;
        phoneColumnSelect.disabled = false;
        messageTemplate.disabled = false;
        delayInput.disabled = false;
        browseBtn.disabled = false;
    }
}

function updateProgress(progress: ProgressData): void {
    const percentage = (progress.current / progress.total) * 100;
    progressBar.style.width = percentage + '%';
    progressText.textContent = `${progress.current} / ${progress.total} messages sent`;
    
    // Add to log
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry log-' + progress.status;
    
    let icon = '';
    if (progress.status === 'success') icon = '✓';
    else if (progress.status === 'failed') icon = '✗';
    else if (progress.status === 'sending') icon = '📤';
    
    logEntry.innerHTML = `
        <span class="log-icon">${icon}</span>
        <span class="log-text">
            [${progress.current}/${progress.total}] ${progress.phone} - ${progress.status}
            ${progress.error ? ': ' + progress.error : ''}
        </span>
    `;
    
    progressLog.insertBefore(logEntry, progressLog.firstChild);
    
    // Keep only last 10 entries visible
    if (progressLog.children.length > 10 && progressLog.lastChild) {
        progressLog.removeChild(progressLog.lastChild);
    }
}

function showResults(resultData: { success: number; failed: number; total: number }): void {
    results.style.display = 'block';
    
    const successCount = document.getElementById('success-count');
    const failedCount = document.getElementById('failed-count');
    const totalCount = document.getElementById('total-count');
    
    if (successCount) successCount.textContent = resultData.success.toString();
    if (failedCount) failedCount.textContent = resultData.failed.toString();
    if (totalCount) totalCount.textContent = resultData.total.toString();
    
    // Re-enable controls
    sendBtn.disabled = false;
    phoneColumnSelect.disabled = false;
    messageTemplate.disabled = false;
    delayInput.disabled = false;
    browseBtn.disabled = false;
    
    alert(
        `Campaign Complete!\n\n` +
        `✓ Successful: ${resultData.success}\n` +
        `✗ Failed: ${resultData.failed}\n` +
        `Total: ${resultData.total}`
    );
}
