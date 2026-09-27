import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/theme.css';

const uiRoot = document.getElementById('ui');
if (!uiRoot) throw new Error('index.html is missing the #ui element');

createRoot(uiRoot).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
