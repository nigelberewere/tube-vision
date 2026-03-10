import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './lib/supabaseAuth';
import { validateEnvironment } from './lib/productionUtils';
import './index.css';

// Validate required environment variables on startup
try {
  validateEnvironment();
} catch (error) {
  console.error('Environment validation failed:', error);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
