import  { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Upload, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import { Progress } from './components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { ExcelRow, ConnectionStatus, ProgressData } from './types';

interface LogEntry {
  phone: string;
  status: 'success' | 'failed' | 'sending';
  error?: string;
}

interface Results {
  success: number;
  failed: number;
  total: number;
}

interface IpcRenderer {
  on(channel: string, listener: (...args: any[]) => void): void;
  removeAllListeners(channel: string): void;
  invoke(channel: string, ...args: any[]): Promise<any>;
}

declare global {
  interface Window {
    require: (module: 'electron') => { ipcRenderer: IpcRenderer };
  }
}

const { ipcRenderer } = window.require('electron');

function App() {
  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [qrCode, setQrCode] = useState<string>('');
  const [excelData, setExcelData] = useState<ExcelRow[] | null>(null);
  const [allExcelData, setAllExcelData] = useState<ExcelRow[] | null>(null);
  const [filePath, setFilePath] = useState<string>('');
  const [worksheets, setWorksheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [phoneColumn, setPhoneColumn] = useState<string>('');
  const [messageTemplate, setMessageTemplate] = useState<string>('');
  const [delay, setDelay] = useState<number>(5);
  const [rowStart, setRowStart] = useState<number>(1);
  const [rowEnd, setRowEnd] = useState<number>(0);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [results, setResults] = useState<Results | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // WhatsApp Events
  useEffect(() => {
    ipcRenderer.on('whatsapp-qr', async (_event: any, qr: string) => {
      setConnectionStatus('qr');
      const qrDataUrl = await QRCode.toDataURL(qr);
      setQrCode(qrDataUrl);
    });

    ipcRenderer.on('whatsapp-authenticated', () => {
      setConnectionStatus('authenticated');
    });

    ipcRenderer.on('whatsapp-ready', () => {
      setConnectionStatus('connected');
      setQrCode('');
    });

    ipcRenderer.on('whatsapp-auth-failure', () => {
      setConnectionStatus('error');
    });

    ipcRenderer.on('whatsapp-disconnected', () => {
      setConnectionStatus('disconnected');
    });

    ipcRenderer.on('send-progress', (_event: any, progressData: ProgressData) => {
      setProgress({ current: progressData.current, total: progressData.total });
      setLogs(prev => [{
        phone: progressData.phone,
        status: progressData.status,
        error: progressData.error
      }, ...prev.slice(0, 9)]);
    });

    return () => {
      ipcRenderer.removeAllListeners('whatsapp-qr');
      ipcRenderer.removeAllListeners('whatsapp-authenticated');
      ipcRenderer.removeAllListeners('whatsapp-ready');
      ipcRenderer.removeAllListeners('whatsapp-auth-failure');
      ipcRenderer.removeAllListeners('whatsapp-disconnected');
      ipcRenderer.removeAllListeners('send-progress');
    };
  }, []);

  const handleConnect = async () => {
    setConnectionStatus('connecting');
    await ipcRenderer.invoke('init-whatsapp');
  };

  const handleSelectFile = async () => {
    const selectedFile = await ipcRenderer.invoke('select-file') as string | null;
    if (selectedFile) {
      setFilePath(selectedFile);
      
      // Get all worksheets
      const sheetsResult = await ipcRenderer.invoke('get-excel-sheets', selectedFile);
      if (sheetsResult.success) {
        setWorksheets(sheetsResult.sheets);
        setSelectedSheet(sheetsResult.sheets[0]);
        
        // Load first sheet by default
        loadSheet(selectedFile, sheetsResult.sheets[0]);
      } else {
        alert(`Failed to read file: ${sheetsResult.error}`);
      }
    }
  };

  const loadSheet = async (file: string, sheetName: string) => {
    const result = await ipcRenderer.invoke('read-excel', file, sheetName);
    if (result.success) {
      setAllExcelData(result.data);
      setRowEnd(result.data.length);
      setExcelData(result.data);
      setSelectedRows([]);
      setPhoneColumn('');
    } else {
      alert(`Failed to read file: ${result.error}`);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    loadSheet(filePath, sheetName);
  };

  const handleRowRangeChange = () => {
    if (!allExcelData) return;
    
    const start = Math.max(1, parseInt(String(rowStart)) || 1);
    const end = Math.min(allExcelData.length, parseInt(String(rowEnd)) || allExcelData.length);
    
    if (start > end) {
      alert('Start row must be less than or equal to end row');
      return;
    }
    
    const filtered = allExcelData.slice(start - 1, end);
    setExcelData(filtered);
    setSelectedRows([]);
  };

  const toggleRowSelection = (index: number) => {
    setSelectedRows(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index];
      }
    });
  };

  const toggleSelectAll = () => {
    if (!excelData) return;
    if (selectedRows.length === excelData.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(excelData.map((_, idx) => idx));
    }
  };

  const handleSendMessages = async () => {
    if (!excelData) return;
    
    const dataToSend = selectedRows.length > 0 
      ? selectedRows.map(idx => excelData[idx])
      : excelData;

    if (!confirm(`Send ${dataToSend.length} messages?`)) return;

    setIsSending(true);
    setResults(null);
    setLogs([]);
    setProgress({ current: 0, total: dataToSend.length });

    const result = await ipcRenderer.invoke('send-messages', {
      data: dataToSend,
      phoneColumn,
      template: messageTemplate,
      delay: parseInt(String(delay))
    });

    setIsSending(false);
    if (result.success) {
      setResults(result.results);
    } else {
      alert(`Failed to send messages: ${result.error}`);
    }
  };

  const formatCellValue = (value: string | number | Date | undefined | null): string => {
    if (!value) return '';
    if (typeof value === 'number') {
      // Check if it's a large number (likely a phone number)
      if (value > 999999999) {
        return value.toString();
      }
      return value.toString();
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Date(value).toLocaleDateString();
    }
    return value.toString();
  };

  const getStatusBadge = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return <span className="flex items-center gap-2 text-green-600"><CheckCircle className="w-4 h-4" /> Connected</span>;
      case 'connecting':
      case 'qr':
      case 'authenticated':
        return <span className="flex items-center gap-2 text-yellow-600"><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</span>;
      case 'error':
        return <span className="flex items-center gap-2 text-red-600"><XCircle className="w-4 h-4" /> Error</span>;
      default:
        return <span className="flex items-center gap-2 text-gray-600"><XCircle className="w-4 h-4" /> Disconnected</span>;
    }
  };

  const columns = excelData && excelData.length > 0 ? Object.keys(excelData[0]) : [];
  const displayColumns = columns.filter(col => col !== '__rowIndex');
  const messagesToSend = selectedRows.length > 0 ? selectedRows.length : (excelData?.length || 0);

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 to-blue-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-linear-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            📱 WhatsApp Automation Tool
          </h1>
          <p className="text-gray-600">Send personalized WhatsApp messages from Excel data</p>
        </div>

        {/* Step 1: Connection */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-6 h-6" />
                Step 1: Connect WhatsApp
              </CardTitle>
              {getStatusBadge(connectionStatus)}
            </div>
            <CardDescription>Connect your WhatsApp account to start sending messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleConnect} 
              disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}
              className="w-full sm:w-auto"
            >
              {connectionStatus === 'connected' ? 'Connected' : 'Connect WhatsApp'}
            </Button>
            
            {qrCode && (
              <div className="flex flex-col items-center space-y-4 p-6 bg-white rounded-lg border">
                <p className="text-sm text-gray-600">Scan this QR code with your phone</p>
                <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                <p className="text-xs text-gray-500">WhatsApp → Settings → Linked Devices → Link a Device</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Upload Excel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-6 h-6" />
              Step 2: Upload Excel File
            </CardTitle>
            <CardDescription>Select your Excel file containing contact information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={filePath} readOnly placeholder="No file selected" className="flex-1" />
              <Button onClick={handleSelectFile} variant="outline" disabled={connectionStatus !== 'connected'}>
                Browse
              </Button>
            </div>

            {excelData && (
              <div className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="worksheet">Select Worksheet</Label>
                    <Select value={selectedSheet} onValueChange={handleSheetChange}>
                      <SelectTrigger id="worksheet">
                        <SelectValue placeholder="Select worksheet..." />
                      </SelectTrigger>
                      <SelectContent>
                        {worksheets.map(sheet => (
                          <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="row-start">From Row</Label>
                    <Input
                      id="row-start"
                      type="number"
                      value={rowStart}
                      onChange={(e) => setRowStart(Number(e.target.value))}
                      min="1"
                      max={allExcelData?.length || 1}
                      className="w-24"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="row-end">To Row</Label>
                    <Input
                      id="row-end"
                      type="number"
                      value={rowEnd}
                      onChange={(e) => setRowEnd(Number(e.target.value))}
                      min="1"
                      max={allExcelData?.length || 1}
                      className="w-24"
                    />
                  </div>

                  <Button onClick={handleRowRangeChange} variant="outline">
                    Apply Range
                  </Button>
                </div>

                <div className="rounded-lg border bg-white">
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedRows.length === excelData.length && excelData.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">
                        {selectedRows.length > 0 ? `${selectedRows.length} selected` : 'Select rows to send'}
                      </span>
                    </div>
                    {selectedRows.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedRows([])}>
                        Clear Selection
                      </Button>
                    )}
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <span className="sr-only">Select</span>
                        </TableHead>
                        <TableHead className="w-16">#</TableHead>
                        {columns.map(col => col !== '__rowIndex' && (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {excelData.slice(0, 10).map((row, idx) => (
                        <TableRow 
                          key={idx}
                          className={selectedRows.includes(idx) ? 'bg-purple-50' : ''}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedRows.includes(idx)}
                              onChange={() => toggleRowSelection(idx)}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-gray-500">
                            {rowStart + idx}
                          </TableCell>
                          {columns.map(col => col !== '__rowIndex' && (
                            <TableCell key={col}>{formatCellValue(row[col])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </div>
                {excelData.length > 10 && (
                  <p className="text-sm text-gray-600">
                    Showing first 10 of {excelData.length} rows
                    {allExcelData && allExcelData.length !== excelData.length && 
                      ` (filtered from ${allExcelData.length} total rows)`
                    }
                  </p>
                )}
                {allExcelData && (
                  <p className="text-sm text-gray-600">
                    Total rows in sheet: {allExcelData.length}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Configure Message */}
        {excelData && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Configure Message</CardTitle>
              <CardDescription>Set up your message template and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone-column">Phone Number Column</Label>
                <Select value={phoneColumn} onValueChange={setPhoneColumn}>
                  <SelectTrigger id="phone-column">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {displayColumns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Message Template</Label>
                <Textarea
                  id="template"
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="Hello {Name}, your balance is {Balance}..."
                  rows={6}
                  className="font-mono"
                />
                <div className="flex flex-wrap gap-2">
                  <p className="text-sm text-gray-600">Available columns:</p>
                  {displayColumns.map(col => (
                    <code key={col} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      {`{${col}}`}
                    </code>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="delay">Delay between messages (seconds)</Label>
                <Input
                  id="delay"
                  type="number"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  min="1"
                  max="60"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Send Messages */}
        {excelData && phoneColumn && messageTemplate && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-6 h-6" />
                Step 4: Send Messages
              </CardTitle>
              <CardDescription>Review and start sending messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="font-semibold">Summary:</p>
                <ul className="text-sm space-y-1">
                  <li>Total messages: <strong>{messagesToSend}</strong></li>
                  <li>Phone column: <strong>{phoneColumn}</strong></li>
                  <li>Delay: <strong>{delay} seconds</strong></li>
                  {selectedRows.length > 0 && (
                    <li className="text-purple-700">
                      <strong>Sending to selected rows only</strong>
                    </li>
                  )}
                </ul>
              </div>

              <Button 
                onClick={handleSendMessages} 
                disabled={isSending}
                size="lg"
                className="w-full"
              >
                {isSending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Start Sending Messages</>
                )}
              </Button>

              {isSending && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>{progress.current} / {progress.total}</span>
                    </div>
                    <Progress value={(progress.current / progress.total) * 100} />
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-sm font-semibold">Recent Messages:</p>
                    {logs.map((log, idx) => (
                      <div key={idx} className={`text-sm p-2 rounded ${
                        log.status === 'success' ? 'bg-green-100 text-green-800' :
                        log.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {log.phone} - {log.status} {log.error && `(${log.error})`}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-100 border border-green-200 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-green-700">{results.success}</div>
                    <div className="text-sm text-green-600">Successful</div>
                  </div>
                  <div className="bg-red-100 border border-red-200 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-red-700">{results.failed}</div>
                    <div className="text-sm text-red-600">Failed</div>
                  </div>
                  <div className="bg-blue-100 border border-blue-200 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-blue-700">{results.total}</div>
                    <div className="text-sm text-blue-600">Total</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-600">
          ⚠️ Use responsibly and comply with WhatsApp's terms of service
        </div>
      </div>
    </div>
  );
}

export default App;
