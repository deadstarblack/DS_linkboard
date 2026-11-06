// Load opacity setting immediately to prevent grey flash
try {
  const savedSettings = localStorage.getItem('linkboardSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    if (settings.canvasOpacity !== undefined) {
      document.documentElement.style.setProperty('--canvas-opacity', settings.canvasOpacity);
    }
  }
} catch (e) {
  console.error('Failed to load initial settings:', e);
}
