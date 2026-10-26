import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Clean up any stale dev-mode service workers so dev scripts are never served from cache
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
