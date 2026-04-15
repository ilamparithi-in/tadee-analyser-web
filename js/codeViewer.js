/**
 * codeViewer.js — entry point for the "View Code" window.
 * Fetches tadee.js from the server and renders it with syntax highlighting.
 */
import { initCodeViewerWindow } from './ui/windows/codeViewer.js';

const viewport = document.getElementById('viewport');
if (viewport) initCodeViewerWindow(viewport);
