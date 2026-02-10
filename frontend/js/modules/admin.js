/**
 * admin.js - Administrative Module Controller
 */

import { usuarios } from './usuarios.js';
import { incrementos } from './incrementos.js';
import { controlPresupuestal } from './control_presupuestal.js';

export const admin = {
    currentTab: 'home',

    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('admin-view');
        container.innerHTML = `
            <div class="fade-in-up" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; padding: 0 4px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <span style="font-size: 32px;">⚙️</span>
                            <h2 style="font-size: 28px; font-weight: 800; color: var(--primary-dark); margin: 0; letter-spacing: -0.02em;">Administración</h2>
                        </div>
                        <p style="color: var(--text-muted); font-size: 15px;">Configuración del sistema, parámetros globales y control de acceso.</p>
                    </div>
                    ${this.currentTab !== 'home' ? `
                        <button id="btn-admin-back" class="btn btn-ghost" style="font-weight: 700; color: var(--primary);">
                            ← Volver al Menú
                        </button>
                    ` : ''}
                </div>

                <div id="admin-view-content"></div>
            </div>
        `;

        const backBtn = document.getElementById('btn-admin-back');
        if (backBtn) backBtn.onclick = () => this.switchTab('home');

        // Expose to window for submodules
        window.admin = this;

        this.renderContent();
    },

    async renderContent() {
        const content = document.getElementById('admin-view-content');
        if (this.currentTab === 'home') {
            this.renderHome(content);
        } else {
            content.innerHTML = '<div id="admin-module-container"></div>';
            if (this.currentTab === 'whitelist') await usuarios.load();
            else if (this.currentTab === 'incrementos') await incrementos.load();
            else if (this.currentTab === 'presupuesto') await controlPresupuestal.load();
        }
    },

    renderHome(container) {
        container.innerHTML = `
            <div class="luxury-grid">
                <div class="action-card" onclick="window.admin.switchTab('whitelist')">
                    <div class="card-icon">👥</div>
                    <h3>Gestión de Usuarios</h3>
                    <p>Administre el acceso al sistema (Whitelist) y los niveles de permisos por rol institucional.</p>
                    <div class="card-cta">Configurar Acceso <span>→</span></div>
                </div>

                <div class="action-card" onclick="window.admin.switchTab('incrementos')">
                    <div class="card-icon">💵</div>
                    <h3>Parámetros Financieros</h3>
                    <p>Actualización del SMLV, porcentajes de incremento y auxilios por vigencia presupuestal.</p>
                    <div class="card-cta">Gestionar Tablas <span>→</span></div>
                </div>

                <div class="action-card" onclick="window.admin.switchTab('presupuesto')">
                    <div class="card-icon">📸</div>
                    <h3>Líneas Base</h3>
                    <p>Gestión de versiones congeladas del presupuesto para auditoría y comparativas históricas.</p>
                    <div class="card-cta">Ver Historial <span>→</span></div>
                </div>
            </div>
        `;
    },

    async switchTab(tab) {
        this.currentTab = tab;
        this.render();
    }
};
