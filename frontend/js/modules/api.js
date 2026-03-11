/**
 * api.js - Central API Client
 */
import { auth } from './auth.js';
import { ui } from '../ui.js';

const CONFIG = {
    BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:8000/api/v1'
        : 'https://bosque-api-516412770014.southamerica-east1.run.app/api/v1'
};

export const api = {
    _loadingCount: 0,

    async _extractErrorDetail(response, fallback = 'Error en la petición') {
        try {
            const payload = await response.clone().json();
            return payload?.detail || fallback;
        } catch (_) {
            try {
                const txt = await response.text();
                return txt || fallback;
            } catch (_) {
                return fallback;
            }
        }
    },

    async request(endpoint, options = {}, silent = false) {
        if (!silent) {
            this._loadingCount++;
            if (this._loadingCount === 1) ui.showLoading();
        }

        const url = `${CONFIG.BASE_URL}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${auth._token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        try {
            const response = await fetch(url, { ...options, headers });

            if (response.status === 401) {
                const detail = await this._extractErrorDetail(
                    response,
                    'Tu sesión expiró por tiempo de seguridad. Inicia sesión nuevamente.'
                );
                auth.handleSessionExpired(detail);
                return null;
            }

            if (!response.ok) {
                const detail = await this._extractErrorDetail(response, 'Error en la petición');
                throw new Error(detail);
            }

            return response.json();
        } finally {
            if (!silent) {
                this._loadingCount--;
                if (this._loadingCount <= 0) {
                    this._loadingCount = 0;
                    ui.hideLoading();
                }
            }
        }
    },

    get(endpoint, silent) { return this.request(endpoint, { method: 'GET' }, silent); },
    post(endpoint, data, silent) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) }, silent); },
    put(endpoint, data, silent) { return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) }, silent); },
    delete(endpoint, silent) { return this.request(endpoint, { method: 'DELETE' }, silent); },

    async upload(endpoint, formData, silent) {
        if (!silent) {
            this._loadingCount++;
            if (this._loadingCount === 1) ui.showLoading();
        }

        const options = {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${auth._token}`
            }
        };

        const url = `${CONFIG.BASE_URL}${endpoint}`;
        try {
            const response = await fetch(url, options);
            if (response.status === 401) {
                const detail = await this._extractErrorDetail(
                    response,
                    'Tu sesión expiró por tiempo de seguridad. Inicia sesión nuevamente.'
                );
                auth.handleSessionExpired(detail);
                return null;
            }
            if (!response.ok) {
                const detail = await this._extractErrorDetail(response, 'Error al subir archivo');
                throw new Error(detail);
            }
            return response.json();
        } finally {
            if (!silent) {
                this._loadingCount--;
                if (this._loadingCount <= 0) {
                    this._loadingCount = 0;
                    ui.hideLoading();
                }
            }
        }
    }
};
