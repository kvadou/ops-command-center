/**
 * Centralized API client for OpsHub frontend.
 *
 * Uses httpOnly cookie authentication (set by the server on login/OAuth).
 * No tokens in localStorage, no Authorization headers needed.
 *
 * Usage:
 *   import api from '../utils/api';
 *   const res = await api.get('/api/foo');
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '', // same origin
  timeout: 30000,
  withCredentials: true, // send httpOnly cookies with every request
});

// Response interceptor — handle 401 (redirect to login)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
