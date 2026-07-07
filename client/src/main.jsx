import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { UIProvider } from './context/UIContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import App from './App.jsx';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <SocketProvider>
              <UIProvider>
                <ConfirmProvider>
                  <App />
                </ConfirmProvider>
              </UIProvider>
            </SocketProvider>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
