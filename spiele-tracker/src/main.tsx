import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initGames } from './games';
import './index.css';

// Spiele registrieren, bevor irgendein Router-Pfad sie nachschlägt.
initGames();

const container = document.getElementById('root');
if (!container) throw new Error('#root fehlt in index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
