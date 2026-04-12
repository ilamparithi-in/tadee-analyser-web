// Entry point: delegates panel layout logic to the reusable panels module.
import { initPanelLayout } from './ui/components/panels.js';

const layout = document.getElementById('panel-layout');
if (layout) initPanelLayout(layout);
