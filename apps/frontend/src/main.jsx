import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App.jsx'
import './index.css'

// Rejestracja modułów AG Grid
ModuleRegistry.registerModules([AllCommunityModule]);

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </React.StrictMode>,
)
