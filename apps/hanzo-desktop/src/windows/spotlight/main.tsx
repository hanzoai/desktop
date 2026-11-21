import './globals.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { HanzoCommandBar } from './HanzoCommandBar';

ReactDOM.createRoot(document.querySelector('#root') as HTMLElement).render(
  <React.StrictMode>
    <HanzoCommandBar />
  </React.StrictMode>,
);
