import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { flushQueue } from './api.js';

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
window.addEventListener('online', flushQueue);
flushQueue();
