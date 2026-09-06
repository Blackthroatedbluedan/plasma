import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './firebase/auth.jsx';
import { InventorySyncProvider } from './firebase/useInventorySync.jsx';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <InventorySyncProvider>
          <App />
        </InventorySyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
