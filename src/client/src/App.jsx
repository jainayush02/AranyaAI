import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Billing from './pages/Billing'
import HelpCenter from './pages/HelpCenter'
import Documentation from './pages/Documentation'
import AnimalProfile from './pages/AnimalProfile'
import AdminPortal from './pages/AdminPortal'
import Layout from './components/Layout'
import axios from 'axios'
import { GoogleOAuthProvider } from '@react-oauth/google'

// Prevent infinite loading by setting a global 15-second timeout
axios.defaults.timeout = 15000;

// Auto-retry: if a request fails due to server/network error, retry once after 2s
// This handles Vercel cold starts where MongoDB needs a moment to reconnect
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config || config._retried) return Promise.reject(error);
    const status = error.response?.status;
    // Retry on 500/502/503 (server errors) or no response (network error)
    if (!error.response || status === 500 || status === 502 || status === 503) {
      config._retried = true;
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


function App() {
  const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "placeholder";

  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <BrowserRouter>
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
            <Route path="docs" element={<Documentation />} />
            <Route path="animal/:id" element={<AnimalProfile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}

export default App
