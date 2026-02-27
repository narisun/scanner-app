// Handles all backend communications
export const API = {
    baseUrl: '/api',

    getHeaders() {
        const token = sessionStorage.getItem('jwt_token');
        return {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        };
    },

    async request(endpoint, options = {}) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: this.getHeaders()
        });

        if (response.status === 401 || response.status === 403) {
            // Trigger a global logout event if token expires
            window.dispatchEvent(new Event('auth-expired'));
            throw new Error('Unauthorized');
        }

        if (response.status === 204) return null; // Handle empty responses (DELETE)
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'API Error');
        return data;
    }
};