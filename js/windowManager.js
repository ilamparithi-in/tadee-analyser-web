// Entry point: initialises window management for all static windows in #viewport.
import { initWindowManager } from './ui/components/windowManager.js';

const viewport = document.getElementById('viewport');
if (viewport) initWindowManager(viewport);
