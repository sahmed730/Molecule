import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { useAppStore } from './store';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAppStore((state) => state.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  const isDarkMode = useAppStore((state) => state.isDarkMode);

  // Apply dark mode on initial load and whenever it changes in the store
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
