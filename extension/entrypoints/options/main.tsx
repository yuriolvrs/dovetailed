// What this file is: entry point that mounts the options page.
// In plain terms: starts the options screen.
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
