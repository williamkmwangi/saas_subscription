import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Handle 401 errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          const authStore = useAuthStore.getState();
          const refreshed = await authStore.refreshToken();

          if (refreshed && this.authToken) {
            originalRequest.headers.Authorization = `Bearer ${this.authToken}`;
            return this.client(originalRequest);
          }
        }

        // Handle other errors
        if (error.response?.status === 429) {
          toast.error('Too many requests. Please try again later.');
        } else if (error.response?.status === 500) {
          toast.error('Something went wrong. Please try again.');
        }

        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  async get<T>(url: string, params?: Record<string, unknown>) {
    return this.client.get<T>(url, { params });
  }

  async post<T>(url: string, data?: unknown) {
    return this.client.post<T>(url, data);
  }

  async patch<T>(url: string, data?: unknown) {
    return this.client.patch<T>(url, data);
  }

  async put<T>(url: string, data?: unknown) {
    return this.client.put<T>(url, data);
  }

  async delete<T>(url: string) {
    return this.client.delete<T>(url);
  }
}

export const api = new ApiClient();

// Helper function to handle API errors
export function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string; code?: string } }>;
    
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error.message || 'An error occurred';
    }
    
    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
    
    if (axiosError.code === 'ERR_NETWORK') {
      return 'Network error. Please check your connection.';
    }
  }
  
  return 'An unexpected error occurred';
}
