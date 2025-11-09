const { shell, ipcRenderer } = require('electron');

// State management
let webCards = [];
let folderCards = [];
let activeMode = 'web'; // 'web' or 'folders'
let editingCardId = null;
let draggedCardId = null;
let settings = {
  stackedMode: false,
  alwaysOnTop: false,
  autoTransparency: false,
  canvasOpacity: 1.0,
  themeColor: '#5eb5b4'
};

// Get active cards based on mode
function getActiveCards() {
  return activeMode === 'web' ? webCards : folderCards;
}

function setActiveCards(cards) {
  if (activeMode === 'web') {
    webCards = cards;
  } else {
    folderCards = cards;
  }
}

// DOM elements
const cardsGrid = document.getElementById('cardsGrid');
const cardModal = document.getElementById('cardModal');
const cardForm = document.getElementById('cardForm');
const cancelBtn = document.getElementById('cancelBtn');
const modalTitle = document.getElementById('modalTitle');
const cardTitleInput = document.getElementById('cardTitle');
const cardTitleLabel = document.getElementById('cardTitleLabel');
const cardUrlInput = document.getElementById('cardUrl');
const cardUrlLabel = document.getElementById('cardUrlLabel');
const cardImageInput = document.getElementById('cardImage');
const cardThemeColorInput = document.getElementById('cardThemeColor');
const colorPicker = document.getElementById('colorPicker');
const pickImageBtn = document.getElementById('pickImageBtn');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const webModeBtn = document.getElementById('webModeBtn');
const folderModeBtn = document.getElementById('folderModeBtn');
const contextMenu = document.getElementById('contextMenu');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');
const opacitySlider = document.getElementById('opacitySlider');

// Load cards from localStorage on startup
function loadCards() {
  // Migrate old single-array cards to web cards
  const oldCards = localStorage.getItem('linkboardCards');
  if (oldCards && !localStorage.getItem('linkboardWebCards')) {
    localStorage.setItem('linkboardWebCards', oldCards);
    localStorage.removeItem('linkboardCards');
  }
  
  const savedWebCards = localStorage.getItem('linkboardWebCards');
  const savedFolderCards = localStorage.getItem('linkboardFolderCards');
  const savedMode = localStorage.getItem('linkboardActiveMode');
  
  if (savedWebCards) {
    webCards = JSON.parse(savedWebCards);
  }
  
  if (savedFolderCards) {
    folderCards = JSON.parse(savedFolderCards);
  }
  
  if (savedMode) {
    activeMode = savedMode;
  }
  
  updateModeUI();
  
  // Clear old sections data
  localStorage.removeItem('linkboardSections');
  
  const savedSettings = localStorage.getItem('linkboardSettings');
  if (savedSettings) {
    const parsed = JSON.parse(savedSettings);
    // Merge saved settings with defaults to ensure all properties exist
    settings = {
      ...settings,
      ...parsed
    };
    // Migrate old compactMode to stackedMode
    if (settings.compactMode !== undefined) {
      settings.stackedMode = settings.compactMode;
      delete settings.compactMode;
    }
  }
  
  // Always apply settings (will use defaults if no saved settings)
  applySettings();
  renderCards(true); // Animate on initial load
}

// Save cards to localStorage
function saveCards() {
  localStorage.setItem('linkboardWebCards', JSON.stringify(webCards));
  localStorage.setItem('linkboardFolderCards', JSON.stringify(folderCards));
  localStorage.setItem('linkboardActiveMode', activeMode);
}

// Save settings to localStorage
function saveSettings() {
  localStorage.setItem('linkboardSettings', JSON.stringify(settings));
}

// Update mode UI
function updateModeUI() {
  if (activeMode === 'web') {
    webModeBtn.classList.add('active');
    folderModeBtn.classList.remove('active');
    cardUrlLabel.textContent = 'URL';
    cardUrlInput.placeholder = 'https://example.com';
    cardTitleInput.placeholder = 'My Link';
    pickFolderBtn.style.display = 'none';
  } else {
    folderModeBtn.classList.add('active');
    webModeBtn.classList.remove('active');
    cardUrlLabel.textContent = 'Folder Path';
    cardUrlInput.placeholder = 'C:\\Projects\\MyProject';
    cardTitleInput.placeholder = 'My Folder';
    pickFolderBtn.style.display = 'block';
  }
}

// Switch mode
// Switch mode
function switchMode(newMode) {
  activeMode = newMode;
  updateModeUI();
  saveCards();
  renderCards(true); // Animate on mode switch
}

// Apply settings to UI
function applySettings() {
  // Stacked mode
  if (settings.stackedMode) {
    cardsGrid.classList.add('compact');
    document.getElementById('viewToggle').classList.add('active');
    document.getElementById('viewToggle').classList.add('active');
  } else {
    cardsGrid.classList.remove('compact');
    document.getElementById('viewToggle').classList.add('active');
    document.getElementById('viewToggle').classList.remove('active');
  }
  
  // Canvas opacity
  document.documentElement.style.setProperty('--canvas-opacity', settings.canvasOpacity);
  if (opacitySlider) {
    opacitySlider.value = settings.canvasOpacity * 100;
  }
  
  // Always on top
  if (settings.alwaysOnTop) {
    ipcRenderer.send('toggle-always-on-top', true);
    document.getElementById('alwaysOnTopToggle').classList.add('active');
    document.getElementById('alwaysOnTopToggle').classList.add('active');
  } else {
    ipcRenderer.send('toggle-always-on-top', false);
    document.getElementById('alwaysOnTopToggle').classList.add('active');
    document.getElementById('alwaysOnTopToggle').classList.remove('active');
  }
  
  // Auto transparency
  if (settings.autoTransparency) {
    document.getElementById('transparencyToggle').classList.add('active');
    document.getElementById('transparencyToggle').classList.add('active');
  } else {
    document.getElementById('transparencyToggle').classList.add('active');
    document.getElementById('transparencyToggle').classList.remove('active');
  }
}

// Render all cards to the grid
function renderCards(animate = false) {
  const cards = getActiveCards();
  
  if (cards.length === 0) {
    const emptyMessage = activeMode === 'web' ? 'No web links yet' : 'No folder links yet';
    cardsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h2>${emptyMessage}</h2>
        <p>Right-click to add your first ${activeMode === 'web' ? 'link' : 'folder'}</p>
      </div>
    `;
    return;
  }

  const stackedClass = settings.stackedMode ? 'compact' : '';
  const animateClass = animate ? 'card-animate' : '';
  
  cardsGrid.innerHTML = cards.map(card => {
    // Default to black background and white text if no theme color
    const themeColor = card.themeColor || '#0a0a0a';
    const titleColor = card.themeColor || '#d0d0d0';
    const hasTitle = card.title && card.title.trim() !== '';
    
    // Handle both web URLs and folder paths
    let hostname;
    let faviconUrl = '';
    if (activeMode === 'web') {
      try {
        hostname = new URL(card.url).hostname;
        faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
      } catch (e) {
        hostname = card.url;
      }
    } else {
      // For folder paths, extract just the folder name
      hostname = card.url.split(/[\\\/]/).pop() || card.url;
      // No favicon for folder paths
    }
    const imageUrl = card.image || faviconUrl;
    
    if (settings.stackedMode) {
      return `
        <div class="card ${stackedClass} ${animateClass}" data-id="${card.id}" data-url="${card.url}" draggable="true" style="${card.image ? 'background: #0a0a0a;' : `background: ${themeColor};`}">
          <div class="card-actions" onclick="event.stopPropagation();">
            <button class="card-btn edit-btn" onclick="event.stopPropagation(); editCard('${card.id}')" title="Edit">e</button>
            <button class="card-btn delete-btn" onclick="event.stopPropagation(); deleteCard('${card.id}')" title="Delete">x</button>
          </div>
          ${card.image ? 
            `<img src="${card.image}" alt="${card.title || hostname}" class="card-image" onerror="this.parentElement.style.background='#0a0a0a'; this.style.display='none'">` : 
            `<div class="card-image" style="background: ${themeColor};"></div>`
          }
          ${!card.image && activeMode === 'web' && faviconUrl ? `<img src="${faviconUrl}" alt="${hostname}" class="card-favicon" onerror="this.style.display='none'">` : ''}
          <div class="card-content">
            ${hasTitle ? `<div class="card-title" style="color: ${titleColor};">${card.title}</div>` : ''}
            ${activeMode === 'web' || !hasTitle ? `<div class="card-url ${!hasTitle ? 'card-url-large' : ''}">${hostname}</div>` : ''}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="card ${stackedClass} ${animateClass}" data-id="${card.id}" data-url="${card.url}" draggable="true" style="${card.image ? 'background: #0a0a0a;' : `background: ${themeColor};`}">
          <div class="card-actions" onclick="event.stopPropagation();">
            <button class="card-btn edit-btn" onclick="event.stopPropagation(); editCard('${card.id}')" title="Edit">e</button>
            <button class="card-btn delete-btn" onclick="event.stopPropagation(); deleteCard('${card.id}')" title="Delete">x</button>
          </div>
          ${card.image ? 
            `<img src="${card.image}" alt="${card.title || hostname}" class="card-image" onerror="this.style.display='none'; this.parentElement.style.background='#0a0a0a';">` : 
            (activeMode === 'web' && faviconUrl ? `<img src="${faviconUrl}" alt="${hostname}" class="card-favicon-standard" onerror="this.style.display='none';">` : '')
          }
          <div class="card-content">
            ${hasTitle ? `<div class="card-title" style="color: ${titleColor};">${card.title}</div>` : ''}
            ${activeMode === 'web' || !hasTitle ? `<div class="card-url ${!hasTitle ? 'card-url-large' : ''}">${hostname}</div>` : ''}
          </div>
        </div>
      `;
    }
  }).join('');
  
  // Attach drag event listeners
  attachDragListeners();
}

// Open link in default browser or folder in Explorer/Finder
function openLink(path) {
  // Prevent transparency and keep window visible
  window.isOpeningLink = true;
  document.body.classList.remove('transparent-mode');
  
  // Tell main process we're opening a link SYNCHRONOUSLY (prevents window from disappearing)
  // This ensures always-on-top is set BEFORE the link opens
  try {
    ipcRenderer.sendSync('opening-link');
  } catch (e) {
    console.error('Failed to set window always on top:', e);
  }
  
  if (activeMode === 'web') {
    shell.openExternal(path);
  } else {
    shell.openPath(path);
  }
  
  // Reset flag after a delay
  setTimeout(() => {
    window.isOpeningLink = false;
  }, 2000);
}

// Show modal for adding new card
function showAddModal() {
  editingCardId = null;
  modalTitle.textContent = 'Add Link';
  cardForm.reset();
  colorPicker.value = '#808080';
  cardModal.classList.remove('hidden');
  cardTitleInput.focus();
}

// Show modal for editing existing card
function showEditModal(card) {
  editingCardId = card.id;
  modalTitle.textContent = 'Edit Link';
  cardTitleInput.value = card.title || '';
  cardUrlInput.value = card.url;
  cardImageInput.value = card.image || '';
  cardThemeColorInput.value = card.themeColor || '';
  colorPicker.value = card.themeColor || '#5eb5b4'; // Default color for picker only
  cardModal.classList.remove('hidden');
  cardTitleInput.focus();
}

// Hide modal
function hideModal() {
  cardModal.classList.add('hidden');
  cardForm.reset();
  editingCardId = null;
}

// Add new card
// Add new card
function addCard(cardData) {
  const cards = getActiveCards();
  const newCard = {
    id: Date.now().toString(),
    title: (cardData.title && cardData.title.trim() !== '') ? cardData.title : null,
    url: cardData.url,
    image: (cardData.image && cardData.image.trim() !== '') ? cardData.image : null,
    themeColor: (cardData.themeColor && cardData.themeColor.trim() !== '') ? cardData.themeColor : null
  };
  cards.push(newCard);
  setActiveCards(cards);
  saveCards();
  renderCards();
}

// Update existing card
// Update existing card
function updateCard(id, cardData) {
  const cards = getActiveCards();
  const index = cards.findIndex(c => c.id === id);
  if (index !== -1) {
    cards[index] = {
      ...cards[index],
      title: (cardData.title && cardData.title.trim() !== '') ? cardData.title : null,
      url: cardData.url,
      image: (cardData.image && cardData.image.trim() !== '') ? cardData.image : null,
      themeColor: (cardData.themeColor && cardData.themeColor.trim() !== '') ? cardData.themeColor : null
    };
    setActiveCards(cards);
    saveCards();
    renderCards();
  }
}

// Drag and drop handlers
function attachDragListeners() {
  const cardElements = document.querySelectorAll('.card[draggable="true"]');
  
  cardElements.forEach(card => {
    // Remove old listeners to prevent duplicates
    card.removeEventListener('dragstart', handleDragStart);
    card.removeEventListener('dragend', handleDragEnd);
    card.removeEventListener('dragover', handleCardDragOver);
    card.removeEventListener('drop', handleCardDrop);
    card.removeEventListener('click', handleCardClick);
    
    // Add fresh listeners
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragover', handleCardDragOver);
    card.addEventListener('drop', handleCardDrop);
    card.addEventListener('click', handleCardClick);
  });
}

function handleCardClick(e) {
  // Don't open link if clicking on action buttons
  if (e.target.closest('.card-actions')) {
    return;
  }
  
  const card = e.currentTarget;
  const url = card.dataset.url;
  if (url) {
    openLink(url);
  }
}

function handleDragStart(e) {
  const card = e.currentTarget;
  draggedCardId = card.dataset.id;
  card.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', card.innerHTML);
}

function handleDragEnd(e) {
  const card = e.currentTarget;
  card.style.opacity = '1';
  
  // Remove all highlights and indicators
  document.querySelectorAll('.card').forEach(c => {
    c.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  
  draggedCardId = null;
}

function reorderCards(draggedId, targetId, insertBefore) {
  const cards = getActiveCards();
  const draggedIndex = cards.findIndex(c => c.id === draggedId);
  const targetIndex = cards.findIndex(c => c.id === targetId);
  
  if (draggedIndex === -1 || targetIndex === -1) return;
  
  const draggedCard = cards[draggedIndex];
  cards.splice(draggedIndex, 1);
  
  const newTargetIndex = cards.findIndex(c => c.id === targetId);
  if (insertBefore) {
    cards.splice(newTargetIndex, 0, draggedCard);
  } else {
    cards.splice(newTargetIndex + 1, 0, draggedCard);
  }
  
  setActiveCards(cards);
  saveCards();
  renderCards();
}

function handleCardDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  const targetCard = e.target.closest('.card');
  if (!targetCard || targetCard.dataset.id === draggedCardId) return;
  
  e.dataTransfer.dropEffect = 'move';
  
  // Determine if we're hovering over top or bottom half
  const rect = targetCard.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  
  // Clear previous indicators
  document.querySelectorAll('.card').forEach(c => {
    c.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  
  if (e.clientY < midpoint) {
    targetCard.classList.add('drag-over-top');
  } else {
    targetCard.classList.add('drag-over-bottom');
  }
  
  return false;
}

function handleCardDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  const targetCard = e.target.closest('.card');
  if (!targetCard || !draggedCardId) return;
  
  const targetCardId = targetCard.dataset.id;
  if (targetCardId === draggedCardId) return;
  
  // Determine position
  const rect = targetCard.getBoundingClientRect();
  const midpoint = rect.top + rect.height / 2;
  const insertBefore = e.clientY < midpoint;
  
  reorderCards(draggedCardId, targetCardId, insertBefore);
  
  return false;
}
function editCard(id) {
  const cards = getActiveCards();
  const card = cards.find(c => c.id === id);
  if (card) {
    showEditModal(card);
  }
}

// Delete card with confirmation
function deleteCard(id) {
  const cards = getActiveCards();
  const card = cards.find(c => c.id === id);
  if (!card) return;
  
  // Show custom delete modal
  const deleteModal = document.getElementById('deleteModal');
  const deleteMessage = document.getElementById('deleteMessage');
  const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
  const deleteCancelBtn = document.getElementById('deleteCancelBtn');
  
  deleteMessage.textContent = `Delete "${card.title || 'this item'}"?`;
  deleteModal.classList.remove('hidden');
  
  // Clean up function to remove both listeners
  const cleanup = () => {
    deleteConfirmBtn.removeEventListener('click', confirmHandler);
    deleteCancelBtn.removeEventListener('click', cancelHandler);
  };
  
  // Handle confirmation
  const confirmHandler = () => {
    setActiveCards(cards.filter(c => c.id !== id));
    saveCards();
    renderCards();
    deleteModal.classList.add('hidden');
    cleanup();
  };
  
  // Handle cancel
  const cancelHandler = () => {
    deleteModal.classList.add('hidden');
    cleanup();
  };
  
  // Add listeners
  deleteConfirmBtn.addEventListener('click', confirmHandler);
  deleteCancelBtn.addEventListener('click', cancelHandler);
}

// Event listeners
cancelBtn.addEventListener('click', hideModal);

// Local image picker
pickImageBtn.addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('pick-image-file');
  if (filePath) {
    cardImageInput.value = filePath;
  }
});

// Folder picker
pickFolderBtn.addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('pick-folder-path');
  if (folderPath) {
    cardUrlInput.value = folderPath;
  }
});

// Color picker sync - update text input when color is picked
colorPicker.addEventListener('input', (e) => {
  cardThemeColorInput.value = e.target.value;
});

// Sync color picker when text input changes (if valid hex)
cardThemeColorInput.addEventListener('input', (e) => {
  const value = e.target.value.trim();
  if (/^#[0-9A-F]{6}$/i.test(value)) {
    colorPicker.value = value;
  }
});

// Mode toggle buttons
webModeBtn.addEventListener('click', () => {
  if (activeMode !== 'web') {
    switchMode('web');
  }
});

folderModeBtn.addEventListener('click', () => {
  if (activeMode !== 'folders') {
    switchMode('folders');
  }
});

// Window controls
minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// Bottom-right corner resize handle with smooth tracking
let isResizing = false;
let lastX, lastY;
let accumulatedDeltaX = 0;
let accumulatedDeltaY = 0;
let resizeThrottle = null;

const resizeHandle = document.querySelector('.resize-handle');

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  lastX = e.screenX;
  lastY = e.screenY;
  accumulatedDeltaX = 0;
  accumulatedDeltaY = 0;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  
  const deltaX = e.screenX - lastX;
  const deltaY = e.screenY - lastY;
  
  lastX = e.screenX;
  lastY = e.screenY;
  
  // Accumulate small movements to reduce IPC spam
  accumulatedDeltaX += deltaX;
  accumulatedDeltaY += deltaY;
  
  // Throttle resize updates for smoother performance
  if (resizeThrottle) return;
  
  resizeThrottle = setTimeout(() => {
    if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
      ipcRenderer.send('resize-window-by', { 
        deltaX: accumulatedDeltaX, 
        deltaY: accumulatedDeltaY 
      });
      accumulatedDeltaX = 0;
      accumulatedDeltaY = 0;
    }
    resizeThrottle = null;
  }, 16); // ~60fps
});

document.addEventListener('mouseup', () => {
  if (isResizing) {
    isResizing = false;
    // Send any remaining accumulated deltas
    if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
      ipcRenderer.send('resize-window-by', { 
        deltaX: accumulatedDeltaX, 
        deltaY: accumulatedDeltaY 
      });
    }
    if (resizeThrottle) {
      clearTimeout(resizeThrottle);
      resizeThrottle = null;
    }
  }
});

// Context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  
  // Don't show context menu if clicking on a card, modal, or mode buttons
  if (e.target.closest('.card') || e.target.closest('.modal') || e.target.closest('.context-menu') || e.target.closest('.mode-toggle')) {
    return;
  }
  
  // Smart positioning - check if menu would go off screen
  const menuWidth = 200;
  const menuHeight = 280;
  let x = e.pageX;
  let y = e.pageY;
  
  // Adjust horizontal position if too close to right edge
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 10;
  }
  
  // Adjust vertical position if too close to bottom edge
  if (y + menuHeight > window.innerHeight) {
    y = window.innerHeight - menuHeight - 10;
  }
  
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.remove('hidden');
});

// Close context menu when clicking elsewhere
document.addEventListener('click', () => {
  contextMenu.classList.add('hidden');
});

// Context menu items
document.getElementById('addLinkItem').addEventListener('click', () => {
  showAddModal();
  contextMenu.classList.add('hidden');
});

document.getElementById('toggleViewItem').addEventListener('click', () => {
  settings.stackedMode = !settings.stackedMode;
  saveSettings();
  applySettings();
  renderCards();
});

document.getElementById('toggleAlwaysOnTopItem').addEventListener('click', () => {
  settings.alwaysOnTop = !settings.alwaysOnTop;
  saveSettings();
  applySettings();
});

document.getElementById('toggleTransparencyItem').addEventListener('click', () => {
  settings.autoTransparency = !settings.autoTransparency;
  saveSettings();
  applySettings();
});

// Opacity slider handler
if (opacitySlider) {
  opacitySlider.addEventListener('input', (e) => {
    settings.canvasOpacity = e.target.value / 100;
    document.documentElement.style.setProperty('--canvas-opacity', settings.canvasOpacity);
    saveSettings();
  });
  
  // Prevent slider from closing menu
  opacitySlider.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

document.getElementById('minimizeItem').addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
  contextMenu.classList.add('hidden');
});

document.getElementById('closeItem').addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// Auto-transparency on blur - but not when opening external links
window.addEventListener('blur', () => {
  // Don't apply transparency if we're opening a link
  if (window.isOpeningLink) {
    return;
  }
  
  if (settings.autoTransparency) {
    document.body.classList.add('transparent-mode');
  }
});

window.addEventListener('focus', () => {
  document.body.classList.remove('transparent-mode');
});

document.body.addEventListener('mouseenter', () => {
  if (settings.autoTransparency) {
    document.body.classList.remove('transparent-mode');
  }
});

document.body.addEventListener('mouseleave', () => {
  if (settings.autoTransparency && document.hasFocus() === false) {
    document.body.classList.add('transparent-mode');
  }
});

// Handle form submission
cardForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const cardData = {
    title: cardTitleInput.value.trim(),
    url: cardUrlInput.value.trim(),
    image: cardImageInput.value.trim(),
    themeColor: cardThemeColorInput.value.trim()
  };

  // Only add protocol for web URLs, not folder paths
  if (activeMode === 'web') {
    if (!cardData.url.startsWith('http://') && !cardData.url.startsWith('https://')) {
      cardData.url = 'https://' + cardData.url;
    }
  }

  if (editingCardId) {
    updateCard(editingCardId, cardData);
  } else {
    addCard(cardData);
  }

  hideModal();
});

// Close modal when clicking outside
cardModal.addEventListener('click', (e) => {
  if (e.target === cardModal) {
    hideModal();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!cardModal.classList.contains('hidden')) {
      hideModal();
    }
    const deleteModal = document.getElementById('deleteModal');
    if (!deleteModal.classList.contains('hidden')) {
      deleteModal.classList.add('hidden');
    }
    if (!contextMenu.classList.contains('hidden')) {
      contextMenu.classList.add('hidden');
    }
  }
});

// Make functions globally available
window.openLink = openLink;
window.editCard = editCard;
window.deleteCard = deleteCard;

// Initialize
loadCards();
