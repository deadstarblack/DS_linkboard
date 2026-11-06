const { shell, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let webCards = [];
let folderCards = [];
let activeMode = 'web'; // 'web' or 'folders'
let editingCardId = null;
let draggedCardId = null;
let pendingDeleteId = null;
let settings = {
  stackedMode: false,
  alwaysOnTop: false,
  autoTransparency: false,
  canvasOpacity: 1.0
};

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

// ---------------------------------------------------------------------------
// DOM elements
// ---------------------------------------------------------------------------
const cardsGrid = document.getElementById('cardsGrid');
const cardModal = document.getElementById('cardModal');
const cardForm = document.getElementById('cardForm');
const cancelBtn = document.getElementById('cancelBtn');
const modalTitle = document.getElementById('modalTitle');
const cardTitleInput = document.getElementById('cardTitle');
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
const deleteModal = document.getElementById('deleteModal');
const deleteMessage = document.getElementById('deleteMessage');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');
const viewToggle = document.getElementById('viewToggle');
const alwaysOnTopToggle = document.getElementById('alwaysOnTopToggle');
const transparencyToggle = document.getElementById('transparencyToggle');
const resizeHandle = document.querySelector('.resize-handle');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Escape text before inserting into innerHTML so titles/paths containing
// quotes or angle brackets can't break the card markup.
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeParse(json, fallback) {
  try {
    const parsed = JSON.parse(json);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    console.error('Failed to parse saved data:', e);
    return fallback;
  }
}

function isValidCssColor(value) {
  if (!value) return false;
  return CSS.supports('color', value);
}

function nonEmpty(value) {
  return value && value.trim() !== '' ? value.trim() : null;
}

// Accept either a URL or a local file path for card images
function normaliseImageSource(value) {
  const v = nonEmpty(value);
  if (!v) return null;
  // Local path first: a Windows drive letter ("C:\...") would otherwise look like a URL scheme
  if (/^([a-z]:[\\/]|\\\\|\/)/i.test(v)) {
    try {
      return pathToFileURL(v).href;
    } catch (e) {
      return v;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // already has a scheme (http, https, file, data)
  return 'https://' + v;
}

function normaliseWebUrl(value) {
  const v = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // keep http, https, mailto, etc.
  return 'https://' + v;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function loadCards() {
  // Migrate old single-array cards to web cards
  const oldCards = localStorage.getItem('linkboardCards');
  if (oldCards && !localStorage.getItem('linkboardWebCards')) {
    localStorage.setItem('linkboardWebCards', oldCards);
    localStorage.removeItem('linkboardCards');
  }
  localStorage.removeItem('linkboardSections'); // obsolete data from an older version

  webCards = safeParse(localStorage.getItem('linkboardWebCards'), []);
  folderCards = safeParse(localStorage.getItem('linkboardFolderCards'), []);
  if (!Array.isArray(webCards)) webCards = [];
  if (!Array.isArray(folderCards)) folderCards = [];

  const savedMode = localStorage.getItem('linkboardActiveMode');
  if (savedMode === 'web' || savedMode === 'folders') {
    activeMode = savedMode;
  }

  const savedSettings = safeParse(localStorage.getItem('linkboardSettings'), null);
  if (savedSettings && typeof savedSettings === 'object') {
    settings = { ...settings, ...savedSettings };
    // Migrate old compactMode to stackedMode
    if (settings.compactMode !== undefined) {
      settings.stackedMode = settings.compactMode;
      delete settings.compactMode;
    }
    delete settings.themeColor; // unused legacy setting
    const opacity = Number(settings.canvasOpacity);
    settings.canvasOpacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0.05, opacity)) : 1;
  }

  updateModeUI();
  applySettings();
  renderCards(true); // Animate on initial load
}

function saveCards() {
  localStorage.setItem('linkboardWebCards', JSON.stringify(webCards));
  localStorage.setItem('linkboardFolderCards', JSON.stringify(folderCards));
  localStorage.setItem('linkboardActiveMode', activeMode);
}

function saveSettings() {
  localStorage.setItem('linkboardSettings', JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Mode + settings UI
// ---------------------------------------------------------------------------
function updateModeUI() {
  const isWeb = activeMode === 'web';
  webModeBtn.classList.toggle('active', isWeb);
  folderModeBtn.classList.toggle('active', !isWeb);
  cardUrlLabel.textContent = isWeb ? 'URL' : 'Folder Path';
  cardUrlInput.placeholder = isWeb ? 'https://example.com' : 'C:\\Projects\\MyProject';
  cardTitleInput.placeholder = isWeb ? 'My Link' : 'My Folder';
  pickFolderBtn.style.display = isWeb ? 'none' : 'block';
}

function switchMode(newMode) {
  if (newMode === activeMode) return;
  activeMode = newMode;
  updateModeUI();
  saveCards();
  renderCards(true); // Animate on mode switch
}

function applySettings() {
  cardsGrid.classList.toggle('compact', settings.stackedMode);
  viewToggle.classList.toggle('active', settings.stackedMode);

  document.documentElement.style.setProperty('--canvas-opacity', settings.canvasOpacity);
  opacitySlider.value = Math.round(settings.canvasOpacity * 100);

  ipcRenderer.send('toggle-always-on-top', settings.alwaysOnTop);
  alwaysOnTopToggle.classList.toggle('active', settings.alwaysOnTop);

  transparencyToggle.classList.toggle('active', settings.autoTransparency);
  if (!settings.autoTransparency) {
    document.body.classList.remove('transparent-mode');
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function getCardLabel(card) {
  if (activeMode === 'web') {
    try {
      return new URL(card.url).hostname || card.url;
    } catch (e) {
      return card.url;
    }
  }
  // For folder paths, show just the folder name
  return card.url.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || card.url;
}

function getFaviconUrl(card) {
  if (activeMode !== 'web') return '';
  try {
    const hostname = new URL(card.url).hostname;
    return hostname ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128` : '';
  } catch (e) {
    return '';
  }
}

function renderCard(card, index, animate) {
  const themeColor = isValidCssColor(card.themeColor) ? card.themeColor : null;
  const background = card.image || !themeColor ? '#0a0a0a' : themeColor;
  const titleColor = themeColor || '#d0d0d0';
  const title = nonEmpty(card.title);
  const label = getCardLabel(card);
  const faviconUrl = getFaviconUrl(card);
  const showLabel = activeMode === 'web' || !title;

  const classes = ['card'];
  if (settings.stackedMode) classes.push('compact');
  if (animate) classes.push('card-animate');

  let media = '';
  if (card.image) {
    media = `<img src="${escapeHtml(card.image)}" alt="" class="card-image" draggable="false">`;
  } else if (faviconUrl) {
    const faviconClass = settings.stackedMode ? 'card-favicon' : 'card-favicon-standard';
    media = `<img src="${escapeHtml(faviconUrl)}" alt="" class="${faviconClass}" draggable="false">`;
  }

  return `
    <div class="${classes.join(' ')}" data-id="${escapeHtml(card.id)}" draggable="true"
         style="background: ${escapeHtml(background)}; --card-index: ${Math.min(index, 20)};"
         title="${escapeHtml(card.url)}">
      <div class="card-actions">
        <button class="card-btn" data-action="edit" title="Edit">e</button>
        <button class="card-btn" data-action="delete" title="Delete">x</button>
      </div>
      ${media}
      <div class="card-content">
        ${title ? `<div class="card-title" style="color: ${escapeHtml(titleColor)};">${escapeHtml(title)}</div>` : ''}
        ${showLabel ? `<div class="card-url">${escapeHtml(label)}</div>` : ''}
      </div>
    </div>
  `;
}

// Broken images (offline favicons, moved files) are removed so the theme colour shows through.
// "error" does not bubble, so listen in the capture phase.
cardsGrid.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') e.target.remove();
}, true);

function renderCards(animate = false) {
  const cards = getActiveCards();

  if (cards.length === 0) {
    const isWeb = activeMode === 'web';
    cardsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h2>${isWeb ? 'No web links yet' : 'No folder links yet'}</h2>
        <p>Right-click to add your first ${isWeb ? 'link' : 'folder'}</p>
      </div>
    `;
    return;
  }

  cardsGrid.innerHTML = cards.map((card, i) => renderCard(card, i, animate)).join('');
}

// ---------------------------------------------------------------------------
// Opening links
// ---------------------------------------------------------------------------
let openingLinkTimer = null;
function openLink(target) {
  // Prevent auto-transparency from kicking in while the other app takes focus
  window.isOpeningLink = true;
  document.body.classList.remove('transparent-mode');

  // Tell main process synchronously so always-on-top is set BEFORE the link opens
  try {
    ipcRenderer.sendSync('opening-link');
  } catch (e) {
    console.error('Failed to notify main process:', e);
  }

  const result = activeMode === 'web' ? shell.openExternal(target) : shell.openPath(target);
  Promise.resolve(result).then((err) => {
    if (typeof err === 'string' && err) {
      console.error('Failed to open:', target, err);
    }
  }).catch((e) => console.error('Failed to open:', target, e));

  clearTimeout(openingLinkTimer);
  openingLinkTimer = setTimeout(() => {
    window.isOpeningLink = false;
  }, 2000);
}

// ---------------------------------------------------------------------------
// Add / edit modal
// ---------------------------------------------------------------------------
function showAddModal() {
  editingCardId = null;
  modalTitle.textContent = activeMode === 'web' ? 'Add Link' : 'Add Folder';
  cardForm.reset();
  colorPicker.value = '#808080';
  cardModal.classList.remove('hidden');
  cardTitleInput.focus();
}

function showEditModal(card) {
  editingCardId = card.id;
  modalTitle.textContent = activeMode === 'web' ? 'Edit Link' : 'Edit Folder';
  cardTitleInput.value = card.title || '';
  cardUrlInput.value = card.url;
  cardImageInput.value = card.image || '';
  cardThemeColorInput.value = card.themeColor || '';
  colorPicker.value = /^#[0-9a-f]{6}$/i.test(card.themeColor || '') ? card.themeColor : '#5eb5b4';
  cardModal.classList.remove('hidden');
  cardTitleInput.focus();
}

function hideModal() {
  cardModal.classList.add('hidden');
  cardForm.reset();
  editingCardId = null;
}

function buildCardFields(cardData) {
  return {
    title: nonEmpty(cardData.title),
    url: cardData.url,
    image: normaliseImageSource(cardData.image),
    themeColor: nonEmpty(cardData.themeColor)
  };
}

function addCard(cardData) {
  const cards = getActiveCards();
  cards.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...buildCardFields(cardData) });
  setActiveCards(cards);
  saveCards();
  renderCards();
}

function updateCard(id, cardData) {
  const cards = getActiveCards();
  const index = cards.findIndex(c => c.id === id);
  if (index === -1) return;
  cards[index] = { ...cards[index], ...buildCardFields(cardData) };
  setActiveCards(cards);
  saveCards();
  renderCards();
}

function editCard(id) {
  const card = getActiveCards().find(c => c.id === id);
  if (card) showEditModal(card);
}

// ---------------------------------------------------------------------------
// Delete modal (listeners attached once; the target id is tracked in state)
// ---------------------------------------------------------------------------
function deleteCard(id) {
  const card = getActiveCards().find(c => c.id === id);
  if (!card) return;
  pendingDeleteId = id;
  deleteMessage.textContent = `Delete "${card.title || getCardLabel(card)}"?`;
  deleteModal.classList.remove('hidden');
  deleteConfirmBtn.focus();
}

function hideDeleteModal() {
  pendingDeleteId = null;
  deleteModal.classList.add('hidden');
}

deleteConfirmBtn.addEventListener('click', () => {
  if (pendingDeleteId !== null) {
    setActiveCards(getActiveCards().filter(c => c.id !== pendingDeleteId));
    saveCards();
    renderCards();
  }
  hideDeleteModal();
});

deleteCancelBtn.addEventListener('click', hideDeleteModal);

deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) hideDeleteModal();
});

// ---------------------------------------------------------------------------
// Card interaction (event delegation: survives re-renders, no per-card wiring)
// ---------------------------------------------------------------------------
cardsGrid.addEventListener('click', (e) => {
  const actionBtn = e.target.closest('[data-action]');
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;

  if (actionBtn) {
    e.stopPropagation();
    if (actionBtn.dataset.action === 'edit') editCard(cardEl.dataset.id);
    if (actionBtn.dataset.action === 'delete') deleteCard(cardEl.dataset.id);
    return;
  }

  const card = getActiveCards().find(c => c.id === cardEl.dataset.id);
  if (card && card.url) openLink(card.url);
});

let lastDragTarget = null;
const DRAG_CLASSES = ['drag-over-top', 'drag-over-bottom', 'drag-over-left', 'drag-over-right'];

function clearDragIndicator() {
  if (lastDragTarget) {
    lastDragTarget.classList.remove(...DRAG_CLASSES);
    lastDragTarget = null;
  }
}

// In stacked mode cards flow vertically, in grid mode they flow horizontally,
// so "insert before" is decided by the matching axis.
function dropPosition(targetCard, e) {
  const rect = targetCard.getBoundingClientRect();
  if (settings.stackedMode) {
    return { before: e.clientY < rect.top + rect.height / 2, axis: 'vertical' };
  }
  return { before: e.clientX < rect.left + rect.width / 2, axis: 'horizontal' };
}

cardsGrid.addEventListener('dragstart', (e) => {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;
  draggedCardId = cardEl.dataset.id;
  cardEl.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedCardId);
});

cardsGrid.addEventListener('dragend', (e) => {
  const cardEl = e.target.closest('.card');
  if (cardEl) cardEl.classList.remove('dragging');
  clearDragIndicator();
  draggedCardId = null;
});

cardsGrid.addEventListener('dragover', (e) => {
  if (!draggedCardId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const targetCard = e.target.closest('.card');
  if (!targetCard || targetCard.dataset.id === draggedCardId) {
    clearDragIndicator();
    return;
  }

  const { before, axis } = dropPosition(targetCard, e);
  const cls = axis === 'vertical'
    ? (before ? 'drag-over-top' : 'drag-over-bottom')
    : (before ? 'drag-over-left' : 'drag-over-right');

  if (lastDragTarget !== targetCard || !targetCard.classList.contains(cls)) {
    clearDragIndicator();
    targetCard.classList.add(cls);
    lastDragTarget = targetCard;
  }
});

cardsGrid.addEventListener('dragleave', (e) => {
  if (!cardsGrid.contains(e.relatedTarget)) clearDragIndicator();
});

cardsGrid.addEventListener('drop', (e) => {
  e.preventDefault();
  const targetCard = e.target.closest('.card');
  if (!targetCard || !draggedCardId) return;
  const targetId = targetCard.dataset.id;
  if (targetId === draggedCardId) return;

  const { before } = dropPosition(targetCard, e);
  reorderCards(draggedCardId, targetId, before);
});

function reorderCards(draggedId, targetId, insertBefore) {
  const cards = getActiveCards().slice();
  const draggedIndex = cards.findIndex(c => c.id === draggedId);
  if (draggedIndex === -1) return;

  const [draggedCard] = cards.splice(draggedIndex, 1);
  const targetIndex = cards.findIndex(c => c.id === targetId);
  if (targetIndex === -1) return;

  cards.splice(insertBefore ? targetIndex : targetIndex + 1, 0, draggedCard);
  setActiveCards(cards);
  saveCards();
  renderCards();
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
cancelBtn.addEventListener('click', hideModal);

pickImageBtn.addEventListener('click', async () => {
  const filePath = await ipcRenderer.invoke('pick-image-file');
  if (filePath) cardImageInput.value = filePath;
});

pickFolderBtn.addEventListener('click', async () => {
  const folderPath = await ipcRenderer.invoke('pick-folder-path');
  if (folderPath) cardUrlInput.value = folderPath;
});

// Keep the colour picker and hex text field in sync
colorPicker.addEventListener('input', (e) => {
  cardThemeColorInput.value = e.target.value;
});

cardThemeColorInput.addEventListener('input', (e) => {
  const value = e.target.value.trim();
  if (/^#[0-9A-F]{6}$/i.test(value)) {
    colorPicker.value = value;
  }
});

cardForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const cardData = {
    title: cardTitleInput.value.trim(),
    url: cardUrlInput.value.trim(),
    image: cardImageInput.value.trim(),
    themeColor: cardThemeColorInput.value.trim()
  };
  if (!cardData.url) return;

  if (activeMode === 'web') {
    cardData.url = normaliseWebUrl(cardData.url);
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
  if (e.target === cardModal) hideModal();
});

// ---------------------------------------------------------------------------
// Mode toggle + window controls
// ---------------------------------------------------------------------------
webModeBtn.addEventListener('click', () => switchMode('web'));
folderModeBtn.addEventListener('click', () => switchMode('folders'));

minimizeBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));

// ---------------------------------------------------------------------------
// Bottom-right corner resize handle
// ---------------------------------------------------------------------------
let isResizing = false;
let lastX = 0;
let lastY = 0;
let accumulatedDeltaX = 0;
let accumulatedDeltaY = 0;
let resizeFrame = null;

function flushResize() {
  resizeFrame = null;
  if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
    ipcRenderer.send('resize-window-by', { deltaX: accumulatedDeltaX, deltaY: accumulatedDeltaY });
    accumulatedDeltaX = 0;
    accumulatedDeltaY = 0;
  }
}

resizeHandle.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isResizing = true;
  lastX = e.screenX;
  lastY = e.screenY;
  accumulatedDeltaX = 0;
  accumulatedDeltaY = 0;
  document.body.classList.add('resizing');
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  accumulatedDeltaX += e.screenX - lastX;
  accumulatedDeltaY += e.screenY - lastY;
  lastX = e.screenX;
  lastY = e.screenY;
  // Batch movements into one IPC message per frame
  if (resizeFrame === null) {
    resizeFrame = requestAnimationFrame(flushResize);
  }
});

function stopResizing() {
  if (!isResizing) return;
  isResizing = false;
  document.body.classList.remove('resizing');
  if (resizeFrame !== null) {
    cancelAnimationFrame(resizeFrame);
  }
  flushResize();
}

document.addEventListener('mouseup', stopResizing);
window.addEventListener('blur', stopResizing);

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------
function hideContextMenu() {
  contextMenu.classList.add('hidden');
}

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();

  // Don't show context menu over a card, modal, or the mode buttons
  if (e.target.closest('.card, .modal, .context-menu, .mode-toggle, .window-controls')) {
    return;
  }

  // Show first so the real size can be measured, then position within the viewport.
  // clientX/Y (not pageX/Y) because the menu is position: fixed and the body scrolls.
  contextMenu.classList.remove('hidden');
  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;
  const x = Math.max(4, Math.min(e.clientX, window.innerWidth - menuWidth - 4));
  const y = Math.max(4, Math.min(e.clientY, window.innerHeight - menuHeight - 4));
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
});

// Close context menu when clicking elsewhere (clicks inside the menu don't bubble here)
document.addEventListener('click', hideContextMenu);
contextMenu.addEventListener('click', (e) => e.stopPropagation());
window.addEventListener('blur', hideContextMenu);

document.getElementById('addLinkItem').addEventListener('click', () => {
  hideContextMenu();
  showAddModal();
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

opacitySlider.addEventListener('input', (e) => {
  settings.canvasOpacity = Number(e.target.value) / 100;
  document.documentElement.style.setProperty('--canvas-opacity', settings.canvasOpacity);
});
opacitySlider.addEventListener('change', saveSettings);

document.getElementById('minimizeItem').addEventListener('click', () => {
  hideContextMenu();
  ipcRenderer.send('minimize-window');
});

document.getElementById('closeItem').addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

// ---------------------------------------------------------------------------
// Auto-transparency
// ---------------------------------------------------------------------------
window.addEventListener('blur', () => {
  if (window.isOpeningLink) return;
  if (settings.autoTransparency) {
    document.body.classList.add('transparent-mode');
  }
});

window.addEventListener('focus', () => {
  document.body.classList.remove('transparent-mode');
});

document.body.addEventListener('mouseenter', () => {
  document.body.classList.remove('transparent-mode');
});

document.body.addEventListener('mouseleave', () => {
  if (settings.autoTransparency && !document.hasFocus() && !window.isOpeningLink) {
    document.body.classList.add('transparent-mode');
  }
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  const active = document.activeElement;
  const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  const cardModalOpen = !cardModal.classList.contains('hidden');
  const deleteModalOpen = !deleteModal.classList.contains('hidden');

  if (e.key === 'Escape') {
    if (cardModalOpen) hideModal();
    if (deleteModalOpen) hideDeleteModal();
    hideContextMenu();
    return;
  }

  // Ctrl/Cmd + N: new card
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    if (!cardModalOpen && !deleteModalOpen) {
      hideContextMenu();
      showAddModal();
    }
    return;
  }

  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (deleteModalOpen && e.key === 'Enter') {
    e.preventDefault();
    deleteConfirmBtn.click();
    return;
  }

  // Tab switching hotkeys (only when not typing and no modal open)
  if (!isTyping && !cardModalOpen && !deleteModalOpen) {
    const key = e.key.toLowerCase();
    if (key === 'w') {
      switchMode('web');
    } else if (key === 'f') {
      switchMode('folders');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      switchMode(activeMode === 'web' ? 'folders' : 'web');
    }
  }
});

// ---------------------------------------------------------------------------
// Initialise
// ---------------------------------------------------------------------------
loadCards();
