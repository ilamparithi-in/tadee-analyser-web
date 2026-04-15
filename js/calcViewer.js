/**
 * calcViewer.js — entry point for the "View Calculations" window.
 */
import { initCalcViewerWindow } from './ui/windows/calcViewer.js';

const viewport = document.getElementById('viewport');
if (viewport) initCalcViewerWindow(viewport);
