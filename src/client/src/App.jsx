import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import axios from 'axios'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ToastProvider } from './components/ToastProvider'

// Performance optimization: Route-based code splitting
// This reduces the initial bundle size drastically, improving load speed on Vercel
const Layout = lazy(() => import('./components/Layout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const Billing = lazy(() => import('./pages/Billing'));
const HelpCenter = lazy(() => import('./pages/HelpCenter'));
const AnimalProfile = lazy(() => import('./pages/AnimalProfile'));
const AdminPortal = lazy(() => import('./pages/AdminPortal'));
const Docs = lazy(() => import('./pages/Docs'));

// Prevent infinite loading by setting a global 15-second timeout
axios.defaults.timeout = 15000;

// Auto-retry pattern: robustly handles serverless "cold starts" and MongoDB connection drops
// This ensures the UX remains smooth even when Vercel is spinning up instances
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config._retried) return Promise.reject(error);
    const status = error.response?.status;
    
    // Retry on common serverless/network failure codes or if the server doesn't respond in time
    if (!error.response || status === 500 || status === 502 || status === 503) {
      config._retried = true;
      // Wait 2s before retrying to allow the database to stabilize
      await new Promise((r) => setTimeout(r, 2000));
      return axios(config);
    }
    return Promise.reject(error);
  }
);

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Simple loading indicator for Suspense fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

function App() {
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "placeholder";

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/admin" element={<Navigate to="/admin-portal" replace />} />

              <Route path="/" element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="admin-portal" element={<AdminPortal />} />
                <Route path="profile" element={<Profile />} />
                <Route path="settings" element={<Settings />} />
                <Route path="billing" element={<Billing />} />
                <Route path="help" element={<HelpCenter />} />
                <Route path="docs" element={<Docs />} />
                <Route path="animal/:id" element={<AnimalProfile />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </GoogleOAuthProvider>
  )
}

export default App
