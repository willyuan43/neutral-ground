import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/400-italic.css';
import './styles.css';
import './theme.css';
import './game.css';
// automated screenshots (?shot): no entry animations, so every capture shows the settled screen
try { if (/[?&]shot\b/.test(window.location.search)) document.documentElement.classList.add('shot'); } catch { /* no window */ }
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
