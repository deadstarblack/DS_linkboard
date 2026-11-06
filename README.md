# DS Linkstack

Formerly LinkBoard. Data now lives in `%APPDATA%\DS Linkstack`; on first launch after the rename it is copied from the old `%APPDATA%\linkboard` folder, which can be deleted once the new one is confirmed working.

A minimalist desktop app for organizing your website links and folder shortcuts with custom cards.

## Features

- ✨ Add website links and folder paths with custom titles
- 🖼️ Optional custom images for each card
- 🎨 Custom theme colors per card
- ✏️ Edit and delete cards
- 🔄 Switch between Web Links and Folder Paths modes
- 💾 Automatic saving (data persists between sessions)
- 🎭 Auto-transparency mode
- 🌊 Smooth animations and interactions
- ⌨️ Keyboard shortcuts: `Ctrl/Cmd + N` for new card, `Escape` to close modals

## Installation & Running

1. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

2. **Run the app**:
   ```bash
   npm start
   ```

## Building for Distribution

To create an executable app you can share with friends:

### First Time Setup
```bash
npm install electron-builder --save-dev
```

### Build Commands

**Windows (Portable .exe):**
```bash
npm run build:win
```

**macOS (DMG installer):**
```bash
npm run build:mac
```

**Linux (AppImage):**
```bash
npm run build:linux
```

**All platforms:**
```bash
npm run build
```

The built apps will be in the `dist` folder. The portable .exe for Windows doesn't require installation - just share the file!

## How to Use

### Basic Operations
1. **W button** - Switch to Web Links mode
2. **F button** - Switch to Folder Paths mode
3. **Right-click** on canvas - Add new link/folder or access settings
4. **Click any card** - Open that website or folder
5. **Hover over cards** - See Edit (e) and Delete (x) buttons

### Adding Links/Folders
- **Title** - What you want to call this item
- **URL/Path** - Website address (e.g., `example.com`) or folder path
- **Image** (optional) - Image URL, a local file path (e.g. `C:\Images\cover.png`), or browse for one
- **Theme Color** (optional) - Hex color for card styling

### Settings (Right-click menu)
- **Stacked Mode** - Toggle between grid and list view
- **Always on Top** - Keep LinkBoard above other windows
- **Auto-Transparency** - App becomes transparent when unfocused
- **Canvas Opacity** - Adjust background opacity

## Data Storage

Your cards are saved locally using localStorage. The data persists between sessions.

## Customization

- **Change colors:** Edit `styles.css`
- **Change window size:** Edit `main.js` (default: 1000x700)
- **Custom icon:** The app uses a teal hamburger menu icon (`icon.png`)

## Sharing with Friends

1. Run `npm run build:win` (or your platform)
2. Find the executable in `dist/` folder
3. Share the `.exe` file (Windows) or appropriate installer
4. No installation needed for portable .exe - just run it!

## Version

Current version: 3.7.0

