/**
 * main.js - SPA Orchestrator (Enhanced)
 */

import { dashboard } from './modules/dashboard.js';
import { auth } from './modules/auth.js';
import { admin } from './modules/admin.js';
import { individual } from './modules/individual.js';
import { reporte } from './modules/reporte.js';
import { financiero } from './modules/financiero.js';
import { vacantes } from './modules/vacantes.js';
import { auditoria } from './modules/auditoria.js';
import { gestionSolicitudes } from './modules/gestion_solicitudes.js';
import { ui } from './ui.js';
import { api } from './modules/api.js';
import { nomina } from './modules/nomina.js';
import { renderChatbotWidget } from './modules/chatbot.js';

// VERSION CONTROL
const APP_VERSION = '2.4.5-BUDGET-DYNAMIC-YEARS';

// Clear cache if version mismatch
const storedVersion = localStorage.getItem('APP_VERSION');
if (storedVersion !== APP_VERSION) {
    console.log(`New version detected: ${APP_VERSION} (was ${storedVersion}). Clearing cache...`);
    localStorage.clear();
    sessionStorage.clear();

    // Clear Cookies
    document.cookie.split(";").forEach(function (c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    localStorage.setItem('APP_VERSION', APP_VERSION);
    // Force reload to ensure fresh state
    window.location.reload();
}

// Global state for interactive components
window._LAST_EMPLOYEE_DATA = null;
window.dashboard = dashboard;
window.reporte = reporte;
window.financiero = financiero; // Expose global
window.individual = individual; // Needed for inline clicks in Nomina
window.ui = ui; // Needed for onclick handlers in modals
window.showReporteDetallado = () => reporte.render();

const router = async () => {
    const hash = window.location.hash || '#/home';

    // Auth Guard
    if (!auth.isAuthenticated() && hash !== '#/') {
        window.location.hash = '#/';
        return;
    }

    // Hide all views & show layout
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

    if (hash === '#/') {
        document.getElementById('main-layout').classList.add('hidden');
        auth.showLogin();
    } else {
        document.getElementById('main-layout').classList.remove('hidden');
        auth.hideLogin();

        // Update Active Tab UI
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('href') === hash);
        });

        if (hash === '#/home') {
            document.getElementById('home-view').classList.remove('hidden');
        } else if (hash === '#/dashboard') {
            document.getElementById('dashboard-view').classList.remove('hidden');
            await dashboard.render(); // Use the new Dashboard Module
        } else if (hash === '#/financiero') {
            const role = auth._user?.role;
            if (role === 'admin' || role === 'financiero' || role === 'talento' || role === 'nomina') {
                document.getElementById('financiero-view').classList.remove('hidden');
                await financiero.render();
            } else {
                window.location.hash = '#/home';
            }
        } else if (hash.indexOf('consulta') !== -1) {
            document.getElementById('consulta-view').classList.remove('hidden');

            // Deep Link Handler (Robust)
            // Wait 50ms to ensuring logic runs after view is painted
            if (hash.includes('?')) {
                setTimeout(() => {
                    try {
                        const params = new URLSearchParams(hash.split('?')[1]);
                        const cedula = params.get('cedula');
                        if (cedula) {
                            console.log('Deep Linking to Cedula:', cedula);
                            const input = document.getElementById('search-cedula');
                            if (input) {
                                input.value = cedula;
                                individual.search(cedula);
                            } else {
                                console.error('Search input not found!');
                            }
                        }
                    } catch (e) {
                        console.error("Deep Link Error", e);
                    }
                }, 100);
            }
        } else if (hash === '#/solicitudes') {
            document.getElementById('solicitudes-view').classList.remove('hidden');
            await gestionSolicitudes.load();
        } else if (hash === '#/nomina') {
            document.getElementById('nomina-view').classList.remove('hidden');
            await nomina.load();
        } else if (hash === '#/admin') {
            if (auth.isAdmin()) {
                document.getElementById('admin-view').classList.remove('hidden');
                admin.init(); // Initialize listeners
            } else {
                window.location.hash = '#/home';
            }
        } else if (hash === '#/vacantes') {
            const role = auth._user?.role;
            if (role === 'admin' || role === 'talento' || role === 'nomina') {
                document.getElementById('vacantes-view').classList.remove('hidden');
                await vacantes.render();
            } else {
                window.location.hash = '#/home';
            }
        } else if (hash === '#/auditoria') {
            if (auth.isAdmin()) {
                document.getElementById('auditoria-view').classList.remove('hidden');
                await auditoria.render();
            } else {
                window.location.hash = '#/home';
            }
        }
    }
};

// Global Exposure for UI Handlers
window.showLiquidacion = (anioMes) => {
    if (!window._LAST_EMPLOYEE_DATA) return;
    const month = window._LAST_EMPLOYEE_DATA.months.find(m => m.anioMes === anioMes);
    if (month) ui.renderLiquidacionModal(month);
};

window.navigateToConsulta = (cedula) => {
    const targetHash = `#/consulta?cedula=${cedula}`;
    // If hash is different, setting it triggers hashchange.
    // If it's the same (or if event fails), we manually run router logic.
    if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
    } else {
        // Force re-run if already on this hash
        router();
    }
};

const checkNotifications = async () => {
    if (!auth.isAuthenticated()) return;
    try {
        // Use a direct fetch to avoid the global api.js 401 -> logout -> reload chain
        // during background polling.
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const baseUrl = isLocal ? 'http://localhost:8000/api/v1' : 'https://bosque-api-516412770014.southamerica-east1.run.app/api/v1';

        const res = await fetch(`${baseUrl}/employees/me/notifications`, {
            headers: { 'Authorization': `Bearer ${auth._token}` }
        });

        if (!res.ok) return; // Silent skip if error or 401

        const notifs = await res.json();
        if (!Array.isArray(notifs)) return;

        const unread = notifs.filter(n => !n.leido).length;
        const badge = document.getElementById('notif-badge');
        if (badge) {
            badge.textContent = unread;
            badge.classList.toggle('hidden', unread === 0);
        }
    } catch (e) {
        // Background polling errors should never affect the UI state or trigger reloads
        console.warn("Background notification check failed (silent)");
    }
};

const showNotificationsModal = async () => {
    try {
        ui.showLoading("Cargando notificaciones...");
        const notifs = await api.get('/employees/me/notifications');
        ui.hideLoading();

        if (!notifs || notifs.length === 0) {
            ui.showToast("No tienes notificaciones pendientes.");
            return;
        }

        const html = `
            <div style="max-height: 480px; overflow-y: auto; padding: 4px;">
                ${notifs.map(n => `
                    <div style="padding: 16px; border-radius: 12px; border: 1px solid var(--border); margin-bottom: 12px; 
                                background: ${n.leido ? 'white' : 'rgba(16,185,129,0.03)'}; 
                                border-left: 4px solid ${n.tipo === 'SUCCESS' ? '#10B981' : (n.tipo === 'ERROR' ? '#EF4444' : '#3B82F6')};">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 10px; font-weight: 800; color: ${n.tipo === 'SUCCESS' ? '#065F46' : (n.tipo === 'ERROR' ? '#991B1B' : '#1E40AF')}; text-transform: uppercase; letter-spacing: 0.05em;">
                                ${n.tipo === 'SUCCESS' ? '✅ Aprobado' : (n.tipo === 'ERROR' ? '❌ Rechazado' : 'ℹ️ Información')}
                            </span>
                            <span style="font-size: 10px; color: #94A3B8; font-weight: 600;">${new Date(n.fecha_creacion).toLocaleString('es-CO')}</span>
                        </div>
                        <div style="font-size: 13px; font-weight: 500; color: #334155; line-height: 1.5;">${n.mensaje}</div>
                    </div>
                `).join('')}
            </div>
            <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px;">
                <button id="mark-read-btn" class="btn btn-primary" style="width: 100%; justify-content: center; height: 44px; border-radius: 12px;">
                    🧹 Marcar todas como leídas
                </button>
            </div>
        `;

        ui.openModal('Tus Notificaciones', html);

        document.getElementById('mark-read-btn')?.addEventListener('click', async () => {
            await api.post('/employees/me/notifications/read-all');
            ui.showToast("Notificaciones marcadas como leídas", "success");
            ui.closeModal();
            checkNotifications();
        });
    } catch (e) {
        ui.hideLoading();
        ui.showToast("Error al cargar notificaciones", "error");
    }
};

const init = () => {
    window.addEventListener('hashchange', router);

    // Global Event Listeners
    document.getElementById('btn-search')?.addEventListener('click', () => {
        const cedula = document.getElementById('search-cedula').value;
        individual.search(cedula);
    });

    document.getElementById('dev-login-btn')?.addEventListener('click', () => {
        auth.loginAsDeveloper();
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => {
        auth.logout();
    });

    document.getElementById('modal-close')?.addEventListener('click', () => {
        ui.closeModal();
    });

    document.getElementById('notif-wrapper')?.addEventListener('click', showNotificationsModal);

    // Initial Date & Auth
    auth.initGoogleAuth();

    // Check notifications once and start polling
    // Wait a bit to ensure session is initialized
    setTimeout(() => {
        checkNotifications();
        setInterval(checkNotifications, 60000);
    }, 2000);

    const dateEl = document.getElementById('hero-date');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('es-CO', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    renderChatbotWidget();
    router();
};

document.addEventListener('DOMContentLoaded', init);
