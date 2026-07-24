// Keep preload minimal; game does not need Node APIs in renderer.
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron-shell');
});
