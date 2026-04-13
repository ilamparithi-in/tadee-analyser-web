// Entry point: initialises Notepad window content (menu, panels, grid, Three.js).
import { initNotepadWindow } from './ui/windows/notepad.js';

const viewport = document.getElementById('viewport');
if (viewport) initNotepadWindow(viewport);
