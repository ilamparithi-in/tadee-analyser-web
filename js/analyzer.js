// Entry point: initialises Analyzer window content (menu, panels, grid, Three.js).
import { initNotepadWindow } from './ui/windows/analyzer.js';

const viewport = document.getElementById('viewport');
if (viewport) initNotepadWindow(viewport);
