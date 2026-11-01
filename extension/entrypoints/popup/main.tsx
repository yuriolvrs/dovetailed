// What this file is: entry point that mounts the popup page.
// In plain terms: starts the popup screen.
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../../src/style.css';
import { followSystemTheme } from '../../src/lib/theme';

followSystemTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
