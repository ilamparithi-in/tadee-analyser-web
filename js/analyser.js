// Entry point: initialises Analyser window content (menu, panels, grid, Three.js).
import { initAnalyserWindow } from './ui/windows/analyser.js';

const viewport = document.getElementById('viewport');
if (viewport) initAnalyserWindow(viewport);
