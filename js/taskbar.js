// Entry point: initialises the Win98 taskbar.
import { initTaskbar } from './ui/components/taskbar.js';

const taskbar = document.getElementById('taskbar');
if (taskbar) initTaskbar(taskbar);
