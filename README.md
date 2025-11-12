# WhatsApp Automation Tool - Desktop App

A beautiful desktop application for automating WhatsApp messages from Excel data, built with Electron and powered by the **whatsapp-web.js** library.

## ✨ Features

- **Modern GUI**: Beautiful, intuitive desktop interface
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Excel Integration**: Import data from Excel (.xlsx) files
- **Message Templates**: Create personalized messages with variables
- **Real-Time Progress**: See live updates as messages are sent
- **QR Code Display**: Scan QR code directly in the app
- **Session Persistence**: Stay logged in between app launches
- **Windows Executable**: Build standalone .exe for easy distribution

## 📋 Requirements

- Node.js v18 or higher
- npm (comes with Node.js)
- Google Chrome or Chromium (used by Puppeteer)

## 🚀 Installation

1. Clone or download this repository

2. Install dependencies:
   ```bash
   npm install
   ```

## 🎯 Usage

### Running the GUI Application

```bash
npm start
```

### Running the CLI Version (Optional)

```bash
npm run cli
```

### Using the Application

1. **Connect WhatsApp**
   - Click "Connect WhatsApp"
   - Scan the QR code with your phone
   - Wait for connection confirmation

2. **Select Excel File**
   - Click "Browse" to select your Excel file
   - Preview your data in the table

3. **Configure Message**
   - Select the column containing phone numbers
   - Write your message template using `{ColumnName}` syntax
   - Set delay between messages (default: 5 seconds)

4. **Send Messages**
   - Review the summary
   - Click "Start Sending Messages"
   - Monitor real-time progress
   - View results when complete

## 📦 Building Executables

### Build for Windows (.exe)

```bash
npm run build
```

The installer will be created in the `dist` folder.

### Build for macOS (.dmg)

```bash
npm run build:mac
```

### Build for Linux (AppImage)

```bash
npm run build:linux
```

## 📊 Excel File Format

Your Excel file should contain:
- A column with phone numbers (with country code)
- Additional columns for personalization

**Example:**

| Name    | Phone       | Balance | DueDate    |
|---------|-------------|---------|------------|
| John    | 12345678901 | $100    | 2023-12-31 |
| Jane    | 10987654321 | $250    | 2023-11-15 |

**Message Template Example:**
```
Hello {Name}, 

Your balance of {Balance} is due on {DueDate}. 
Please make payment soon.

Thank you!
```

## 🎨 Features Breakdown

### Step 1: WhatsApp Connection
- Initialize WhatsApp Web integration
- Display QR code for authentication
- Show connection status with visual indicators
- Automatic session persistence

### Step 2: Excel File Selection
- File browser with Excel file filtering
- Live data preview (first 5 rows)
- Column detection and display
- Total row count

### Step 3: Message Configuration
- Phone column selector
- Message template editor with syntax highlighting
- Available columns reference
- Adjustable message delay
- Live summary preview

### Step 4: Message Sending
- Confirmation dialog before sending
- Real-time progress bar
- Live message log with status icons
- Detailed results with success/failure counts
- Professional results dashboard

## 🔧 Technical Details

### Project Structure

```
whatsapp-automation/
├── main.js                 # Electron main process
├── renderer.js             # UI logic and event handlers
├── whatsapp-handler.js     # WhatsApp integration
├── index.js                # CLI version (optional)
├── index.html              # Main UI
├── styles.css              # Styling
├── package.json            # Dependencies and build config
├── assets/                 # Icons and images
│   └── icon.png
└── dist/                   # Build output (generated)
```

### Technologies Used

- **Electron**: Desktop application framework
- **whatsapp-web.js**: WhatsApp Web API client
- **Puppeteer**: Browser automation (via whatsapp-web.js)
- **xlsx**: Excel file reading
- **qrcode**: QR code generation and display
- **electron-builder**: Application packaging

## ⚙️ Configuration

### Custom Build Settings

Edit `package.json` under the `build` section to customize:
- Application name
- Icons
- Installation settings
- Output formats

### Adding Custom Icons

Place your icons in the `assets` folder:
- **Windows**: `icon.ico` (256x256 or multi-size)
- **macOS**: `icon.icns` (512x512 recommended)
- **Linux**: `icon.png` (512x512 recommended)

## 🐛 Troubleshooting

### Application Won't Start
- Ensure Node.js v18+ is installed
- Delete `node_modules` and run `npm install` again
- Check console for error messages

### WhatsApp Won't Connect
- Ensure you have an active internet connection
- Try deleting the `.wwebjs_auth` folder and reconnecting
- Make sure Chrome/Chromium is installed

### Messages Not Sending
- Verify phone numbers include country codes
- Check that phone numbers are valid WhatsApp numbers
- Ensure you're not rate-limited (increase delay)

### Build Errors
- Install required build tools for your OS
- Windows: `npm install --global windows-build-tools`
- macOS: Install Xcode Command Line Tools
- Linux: Install build-essential

## 📱 Phone Number Format

Ensure phone numbers:
- Include country code (e.g., 1 for USA, 44 for UK)
- Contain only digits (no spaces, dashes, or special characters)
- Are registered WhatsApp numbers

**Valid formats:**
- `12345678901` (US number)
- `441234567890` (UK number)
- `919876543210` (India number)

## ⚠️ Important Notes

- **First Launch**: You'll need to scan a QR code to authenticate
- **Rate Limiting**: Use appropriate delays (5+ seconds) to avoid being blocked
- **Terms of Service**: Only message people who have consented
- **No Guarantee**: Using bots on WhatsApp can result in account restrictions
- **Backup**: WhatsApp may update and break compatibility - use at your own risk

## 🔒 Privacy & Security

- All authentication data is stored locally in `.wwebjs_auth`
- No data is sent to external servers (except WhatsApp)
- Excel files are processed locally on your machine
- Delete `.wwebjs_auth` folder to clear session data

## 📄 License

This project uses whatsapp-web.js which is licensed under the Apache License 2.0.

## 🙏 Credits

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - WhatsApp Web API
- [Electron](https://www.electronjs.org/) - Desktop app framework

## ⚖️ Disclaimer

This project is not affiliated with WhatsApp or Meta. It uses the unofficial whatsapp-web.js library.

This tool is for educational and personal use only. Use responsibly and in accordance with WhatsApp's terms of service. The developers are not responsible for any misuse, account bans, or other consequences resulting from the use of this tool.

## 🆘 Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review [whatsapp-web.js documentation](https://wwebjs.dev/)
3. Check existing GitHub issues

---

**Happy Messaging! 📱✨**
