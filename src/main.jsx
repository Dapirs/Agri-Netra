import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { initializePredictionLabels } from './logic/predictionMapper.js';

// Load the label file in the background: until it arrives (or if it never does),
// predictions use the built-in list, which is identical. Never block the first screen on it.
initializePredictionLabels();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
