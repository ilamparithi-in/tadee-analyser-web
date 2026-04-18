// Entry point: initialises Batch Mode window.
import { initBatchWindow } from './ui/windows/batchWindow.js';

const viewport = document.getElementById('viewport');
if (viewport) initBatchWindow(viewport);
