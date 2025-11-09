# DS_linkboard
lightweight visual-first desktop app for organising links and local folder paths

## How to Use

### Basic Operations
1. **W button** - Switch to Web Links mode (to be implemented)
2. **F button** - Switch to Folder Paths mode (to be implemented)
3. **Right-click** on canvas - Add new link/folder or access settings
4. **Click any card** - Open that website or folder
5. **Hover over cards** - See Edit (e) and Delete (x) buttons

### Adding Links/Folders
- **Title** - What you want to call this item
- **URL/Path** - Website address (e.g., `example.com`) or folder path
- **Image** (optional) - Custom image URL or browse for local image
- **Theme Color** (optional) - Hex color for card styling
- **Favicons** - If no img provided, will attempt to use site's favicon

### Settings (Right-click menu)
- **Stacked Mode** - Toggle between grid and list view
- **Always on Top** - Keep LinkBoard above other windows
- **Auto-Transparency** - App becomes transparent when unfocused
- **Canvas Opacity** - Adjust background opacity

## Data Storage

Your cards are saved locally using localStorage. The data persists between sessions.
