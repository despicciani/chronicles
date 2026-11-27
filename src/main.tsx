import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

try {
  const savedFont = localStorage.getItem('chronicles_ui_font') || 'philosopher';
  document.documentElement.setAttribute('data-ui-font', savedFont);
} catch {
  document.documentElement.setAttribute('data-ui-font', 'philosopher');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
