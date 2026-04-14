/**
 * notepad.js — Notepad window content initialiser.
 *
 * The Notepad window element is statically authored in index.html with
 * id="win-notepad". This module initialises its interactive sub-components:
 * menu bar, splitter panels, results grid, and Three.js geometry viewer.
 *
 * @param {HTMLElement} viewport — the #viewport element (passed for consistency
 *                                 with the addWindow API, not used directly here)
 */

import * as THREE           from 'three';
import { initMenuBar }      from '../components/menuSystem.js';
import { initPanelLayout }  from '../components/panels.js';
import { initResultsGrid }  from '../components/grid.js';
import { initTooltips }     from '../components/tooltip.js';

export function initNotepadWindow(viewport) {
  const win = document.getElementById('win-notepad');
  if (!win) return;

  // Tooltips
  initTooltips(win);

  // Menu bar
  const menuBar = win.querySelector('#menu-bar');
  if (menuBar) initMenuBar(menuBar);

  // Splitter panel layout
  const layout = win.querySelector('#panel-layout');
  if (layout) initPanelLayout(layout);

  // Results grid
  const grid = win.querySelector('#results-grid');
  if (grid) initResultsGrid(grid);

  // Three.js geometry viewer
  const container = win.querySelector('#canvas-container');
  if (container) _initThreeJs(container);
}

function _initThreeJs(container) {
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.z = 2;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshNormalMaterial()
  );
  scene.add(cube);

  let lastW = 0, lastH = 0;

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) {
      lastW = w; lastH = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  resize();
  new ResizeObserver(resize).observe(container);

  (function animate() {
    requestAnimationFrame(animate);
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.01;
    renderer.render(scene, camera);
  })();
}
