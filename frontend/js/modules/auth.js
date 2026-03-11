/**
 * auth.js - Authentication Module
 */

import { renderChatbotWidget } from './chatbot.js';

export const auth = {
    _token: localStorage.getItem('user_token'),
    _user: JSON.parse(localStorage.getItem('user_info')),
    _clientId: "516412770014-7btmbo0e2kdj8ictqj3j6ksvfc2gmu8e.apps.googleusercontent.com",
    _googleRetryCount: 0,
    _sessionExpiredHandled: false,
    _sessionExpiryTimer: null,

    initGoogleAuth() {
        const slot = document.getElementById("google-login-btn");
        if (!slot) return;
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Localhost logic: keep Dev Access visible, but do not block Google Sign-In.
        if (isLocalHost) {
            const devContainer = document.getElementById("dev-access-container");
            if (devContainer) devContainer.classList.remove('hidden');
        }

        if (!window.google?.accounts?.id) {
            if (this._googleRetryCount < 20) {
                this._googleRetryCount += 1;
                setTimeout(() => this.initGoogleAuth(), 200);
            } else {
                slot.innerHTML = '<div style="color:#B91C1C; font-size:12px; font-weight:600;">No fue posible cargar Google Sign-In.</div>';
                this._setLoginError('No se pudo cargar el proveedor de Google. Revisa bloqueadores de contenido o red corporativa.');
            }
            return;
        }
        this._googleRetryCount = 0;

        try {
            google.accounts.id.initialize({
                client_id: this._clientId,
                callback: (res) => this._handleCredentialResponse(res)
            });

            const buttonWidth = Math.min(380, Math.max(240, Math.floor(slot.clientWidth || 320)));
            google.accounts.id.renderButton(
                slot,
                { theme: "outline", size: "large", width: buttonWidth, shape: "pill", text: "signin_with" }
            );
            this._clearLoginError();
        } catch (e) {
            console.error("Google Auth error:", e);
            this._setLoginError('Error inicializando Google Sign-In. Intenta recargar la página.');
        }
    },

    loginAsDeveloper() {
        this._clearSessionExpiryTimer();
        this._token = 'local';
        localStorage.setItem('user_token', this._token);
        this.checkSession();
    },

    async _handleCredentialResponse(response) {
        this._token = response.credential;
        localStorage.setItem('user_token', this._token);
        await this.checkSession();
    },

    async checkSession() {
        if (!this._token) {
            this.showLogin();
            return;
        }

        try {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            // BYPASS fetch for local developer mode
            if (this._token === 'local' && isLocal) {
                const params = new URLSearchParams(window.location.search);
                const forcedRole = params.get('forceRole') || 'admin';
                this._user = {
                    email: "dev@local",
                    role: forcedRole,
                    nombre: "Desarrollador Local (" + forcedRole + ")",
                    source: "local_debug"
                };
                localStorage.setItem('user_info', JSON.stringify(this._user));
                this.hideLogin();
                renderChatbotWidget();
                // Maintain the role in current session
                window.location.hash = '#/home';
                return;
            }

            const baseUrl = isLocal
                ? 'http://localhost:8000/api/v1'
                : 'https://bosque-api-516412770014.southamerica-east1.run.app/api/v1';

            const res = await fetch(`${baseUrl}/employees/me`, {
                headers: { 'Authorization': `Bearer ${this._token}` }
            });

            if (res.ok) {
                const data = await res.json();
                this._user = data.user;
                this._sessionExpiredHandled = false;
                localStorage.setItem('user_info', JSON.stringify(this._user));
                this.hideLogin();
                this._scheduleSessionExpiry();
                renderChatbotWidget();
                window.location.hash = '#/home';
            } else {
                let detail = `Error de autenticación (${res.status})`;
                try {
                    const payload = await res.json();
                    detail = payload?.detail || detail;
                } catch (_) { }
                throw new Error(detail);
            }
        } catch (err) {
            console.error(err);
            this.handleAuthFailure(err?.message || 'No fue posible validar la sesión');
        }
    },

    isAuthenticated() {
        return !!this._token && !!this._user;
    },

    isAdmin() {
        return this._user?.role === 'admin';
    },

    showLogin() {
        const loginView = document.getElementById('login-view');
        const mainLayout = document.getElementById('main-layout');

        document.body.classList.add('login-mode');
        if (loginView) loginView.classList.remove('hidden');
        if (mainLayout) mainLayout.classList.add('hidden');
        this._clearLoginError();
        this._bindLoginCardFx();
    },

    hideLogin() {
        const loginView = document.getElementById('login-view');
        const mainLayout = document.getElementById('main-layout');

        document.body.classList.remove('login-mode');
        if (loginView) loginView.classList.add('hidden');
        if (mainLayout) mainLayout.classList.remove('hidden');
        this._resetLoginCardFx();

        const fullName = this._user?.nombre || '';
        const nameParts = fullName.split(' ').filter(p => p.trim() !== '');

        // Logic for 1st Name and 1st Last Name (Standard in Colombia: P.Nombre S.Nombre P.Apellido S.Apellido)
        let shortName = nameParts[0] || 'Usuario';
        if (nameParts.length >= 3) {
            shortName += ' ' + nameParts[2];
        } else if (nameParts.length === 2) {
            shortName += ' ' + nameParts[1];
        }

        const role = this._user?.role || '';
        document.getElementById('user-name').textContent = shortName;
        document.getElementById('header-role').textContent = role.toUpperCase() || 'SERVIDOR';

        // Update Hero Welcome Name
        const heroNameEl = document.getElementById('hero-user-name');
        if (heroNameEl) heroNameEl.textContent = shortName;

        // Role-based Nav Visibility
        if (role === 'admin') {
            document.querySelectorAll('.admin-only, .financiero-access, .talento-access, .nomina-access').forEach(el => el.classList.remove('hidden'));
        } else if (role === 'financiero') {
            document.querySelectorAll('.financiero-access').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.admin-only, .talento-access, .nomina-access').forEach(el => {
                if (!el.classList.contains('financiero-access')) {
                    el.classList.add('hidden');
                }
            });
        } else if (role === 'talento') {
            document.querySelectorAll('.talento-access').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.admin-only, .financiero-access, .nomina-access').forEach(el => {
                if (!el.classList.contains('talento-access')) {
                    el.classList.add('hidden');
                }
            });
        } else if (role === 'nomina') {
            // Nomina role is equal to Talento but with Nomina and Solicitudes access
            document.querySelectorAll('.talento-access, .nomina-access').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.admin-only, .financiero-access').forEach(el => {
                if (!el.classList.contains('talento-access') && !el.classList.contains('nomina-access')) {
                    el.classList.add('hidden');
                }
            });
        } else {
            document.querySelectorAll('.admin-only, .financiero-access, .talento-access, .nomina-access').forEach(el => el.classList.add('hidden'));
        }
    },

    _bindLoginCardFx() {
        // Disabled intentionally: user requested no hover shadow/movement on login card.
        return;
    },

    _resetLoginCardFx() {
        const card = document.getElementById('login-interactive-card');
        if (card) {
            card.style.transform = 'none';
        }
    },

    _decodeJwtPayload(token) {
        try {
            const parts = String(token || '').split('.');
            if (parts.length !== 3) return null;
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = '='.repeat((4 - (b64.length % 4)) % 4);
            return JSON.parse(atob(b64 + pad));
        } catch (_) {
            return null;
        }
    },

    _clearSessionExpiryTimer() {
        if (this._sessionExpiryTimer) {
            clearTimeout(this._sessionExpiryTimer);
            this._sessionExpiryTimer = null;
        }
    },

    _scheduleSessionExpiry() {
        this._clearSessionExpiryTimer();
        if (!this._token || this._token === 'local') return;

        const payload = this._decodeJwtPayload(this._token);
        const expSeconds = Number(payload?.exp || 0);
        if (!expSeconds) return;

        const msUntilExpiry = (expSeconds * 1000) - Date.now();
        if (msUntilExpiry <= 0) {
            this.handleSessionExpired("Tu sesión expiró por tiempo de seguridad. Inicia sesión nuevamente.");
            return;
        }

        this._sessionExpiryTimer = setTimeout(() => {
            this.handleSessionExpired("Tu sesión expiró por tiempo de seguridad. Inicia sesión nuevamente.");
        }, msUntilExpiry + 500);
    },

    _setLoginError(message) {
        const errorEl = document.getElementById('login-error-msg');
        if (!errorEl) return;
        errorEl.textContent = message || 'No fue posible iniciar sesión.';
        errorEl.classList.remove('hidden');
    },

    _clearLoginError() {
        const errorEl = document.getElementById('login-error-msg');
        if (!errorEl) return;
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    },

    handleAuthFailure(message) {
        this._clearSessionExpiryTimer();
        this._token = null;
        this._user = null;
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_info');
        window.location.hash = '#/';
        this.showLogin();
        this._setLoginError(message);
    },

    handleSessionExpired(message = "Tu sesión expiró por tiempo de seguridad. Inicia sesión nuevamente.") {
        if (this._sessionExpiredHandled) return;
        this._sessionExpiredHandled = true;
        this._clearSessionExpiryTimer();
        this._token = null;
        this._user = null;
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_info');
        window.location.hash = '#/';
        this.showLogin();
        this._setLoginError(message);
        setTimeout(() => window.alert(message), 80);
    },

    logout(reload = true) {
        this._sessionExpiredHandled = false;
        this._clearSessionExpiryTimer();
        this._token = null;
        this._user = null;
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_info');
        window.location.hash = '#/';
        if (reload) {
            location.reload();
        } else {
            this.showLogin();
        }
    }
};

// Handle Buttons
document.getElementById('logout-btn')?.addEventListener('click', () => auth.logout());
document.getElementById('dev-login-btn')?.addEventListener('click', () => auth.loginAsDeveloper());
