/**
 * auth.js - Authentication Module
 */

export const auth = {
    _token: localStorage.getItem('user_token'),
    _user: JSON.parse(localStorage.getItem('user_info')),
    _clientId: "516412770014-7btmbo0e2kdj8ictqj3j6ksvfc2gmu8e.apps.googleusercontent.com",

    initGoogleAuth() {
        if (!window.google) return;

        // Localhost logic: show Dev Access and skip Google Auth init
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const devContainer = document.getElementById("dev-access-container");
            if (devContainer) devContainer.classList.remove('hidden');

            const btn = document.getElementById("google-login-btn");
            if (btn) btn.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">Google Login deshabilitado en local</div>';
            return;
        }

        try {
            google.accounts.id.initialize({
                client_id: this._clientId,
                callback: (res) => this._handleCredentialResponse(res)
            });

            google.accounts.id.renderButton(
                document.getElementById("google-login-btn"),
                { theme: "outline", size: "large", width: 300 }
            );
        } catch (e) {
            console.error("Google Auth error:", e);
        }
    },

    loginAsDeveloper() {
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
                localStorage.setItem('user_info', JSON.stringify(this._user));
                this.hideLogin();
                window.location.hash = '#/home';
            } else {
                throw new Error("Sesión expirada");
            }
        } catch (err) {
            console.error(err);
            this.logout();
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

        if (loginView) loginView.classList.remove('hidden');
        if (mainLayout) mainLayout.classList.add('hidden');
    },

    hideLogin() {
        const loginView = document.getElementById('login-view');
        const mainLayout = document.getElementById('main-layout');

        if (loginView) loginView.classList.add('hidden');
        if (mainLayout) mainLayout.classList.remove('hidden');

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
            document.querySelectorAll('.admin-only, .financiero-access, .talento-access').forEach(el => el.classList.remove('hidden'));
        } else if (role === 'financiero') {
            document.querySelectorAll('.financiero-access').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.admin-only, .talento-access').forEach(el => {
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
            // Nomina role is equal to Talento but with Nomina module access
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

    logout() {
        this._token = null;
        this._user = null;
        localStorage.removeItem('user_token');
        localStorage.removeItem('user_info');
        window.location.hash = '#/';
        location.reload();
    }
};

// Handle Buttons
document.getElementById('logout-btn')?.addEventListener('click', () => auth.logout());
document.getElementById('dev-login-btn')?.addEventListener('click', () => auth.loginAsDeveloper());
