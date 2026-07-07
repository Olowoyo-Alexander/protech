import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
});

// Attach JWT from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('prostech_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Surface a clean error message
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // No `err.response` means the request never reached the server (server down,
    // wrong port, or offline). axios reports this as a cryptic "Network Error",
    // so replace it with something actionable.
    if (!err.response) {
      const message =
        err.code === 'ECONNABORTED'
          ? 'The server took too long to respond. Please try again.'
          : "Can't reach the server. Make sure the backend is running (npm run dev).";
      return Promise.reject(new Error(message));
    }
    const message = err.response?.data?.message || err.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default api;
