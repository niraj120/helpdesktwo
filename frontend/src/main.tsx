import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { BrandingProvider } from './contexts/BrandingContext'
import { ProjectContextProvider } from './contexts/ProjectContext'
import NetworkStatusNotifier from './components/NetworkStatusNotifier'

import './i18n/index' // Initialize i18n
import App from './App.tsx'
import './index.css'
import './styles/hubblehox.css' // HubbleHox Design System
import './styles/accessibility.css' // Import accessibility styles

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      retry: 2,
    },
  },
})

// Use StrictMode only in development to prevent double API calls in production
const isDevelopment = import.meta.env.DEV;

const AppWrapper = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter future={{ v7_relativeSplatPath: true }}>
      <BrandingProvider>
        <ProjectContextProvider>
          <App />
          <NetworkStatusNotifier />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                style: {
                  background: '#22c55e',
                },
              },
              error: {
                style: {
                  background: '#ef4444',
                },
              },
            }}
          />
        </ProjectContextProvider>
      </BrandingProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  isDevelopment ? (
    <React.StrictMode>
      <AppWrapper />
    </React.StrictMode>
  ) : (
    <AppWrapper />
  )
);