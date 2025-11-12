export interface ExcelRow {
  [key: string]: string | number | Date | undefined;
  __rowIndex?: number;
}

export interface MessageResult {
  phone: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface SendMessagesResult {
  success: boolean;
  results?: {
    success: number;
    failed: number;
    total: number;
  };
  error?: string;
}

export interface ReadExcelResult {
  success: boolean;
  data?: ExcelRow[];
  error?: string;
}

export interface GetSheetsResult {
  success: boolean;
  sheets?: string[];
  error?: string;
}

export interface SendMessagesOptions {
  data: ExcelRow[];
  phoneColumn: string;
  template: string;
  delay: number;
}

export interface ProgressData {
  current: number;
  total: number;
  phone: string;
  status: 'success' | 'failed' | 'sending';
  error?: string;
}

export interface CreateGroupResult {
  success: boolean;
  groupId?: string;
  groupName?: string;
  error?: string;
}

export interface CreateGroupOptions {
  groupName: string;
  participants: string[];
}

export interface WhatsAppHandlerEvents {
  'qr': (qr: string) => void;
  'authenticated': () => void;
  'ready': () => void;
  'auth_failure': (msg: string) => void;
  'disconnected': (reason: string) => void;
  'progress': (data: ProgressData) => void;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'authenticated' | 'connected' | 'error';
