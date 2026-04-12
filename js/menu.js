// Entry point: delegates all menu logic to the reusable menuSystem module.
import { initMenuBar } from './ui/components/menuSystem.js';

const menuBar = document.getElementById('menu-bar');
if (menuBar) initMenuBar(menuBar);
