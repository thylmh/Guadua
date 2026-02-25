import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';

export const nomina = {
    summary: [],
    catalogs: null,
    currentTab: 'home',
    versions: [],
    dashboardData: null,

    async load() {
        const target = document.getElementById('nomina-container');
        if (!target) return;

        // Reset state for clean load
        if (!this.catalogs) await this.loadCatalogs();
        if (this.versions.length === 0) await this.loadVersions();

        // Always fetch summary to ensure we have periods
        await this.fetchSummary(true);

        await this.showTab(this.currentTab);
    },

    async loadCatalogs() {
        try {
            this.catalogs = await api.get('/employees/catalogos');
        } catch (e) {
            console.error("Error loading catalogs", e);
        }
    },

    async loadVersions() {
        try {
            // Mapping fix: versions from API use 'nombre' and 'fecha'
            const data = await api.get('/admin/presupuesto/versiones');
            this.versions = data || [];
        } catch (e) {
            console.error("Error loading versions", e);
        }
    },

    renderLayout() {
        const target = document.getElementById('nomina-container');

        target.innerHTML = `
            <div class="fade-in-up">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; padding: 0 4px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <span style="font-size: 32px;">📦</span>
                            <h2 style="font-size: 28px; font-weight: 800; color: var(--primary-dark); margin: 0; letter-spacing: -0.02em;">Gestión de Nómina</h2>
                        </div>
                        <p style="color: var(--text-muted); font-size: 15px;">Conciliación entre presupuesto proyectado y liquidaciones reales de Novasoft.</p>
                    </div>
                    ${this.currentTab !== 'home' ? `
                        <button id="btn-nomina-back" class="btn btn-ghost" style="font-weight: 700; color: var(--primary);">
                            ← Volver al Menú
                        </button>
                    ` : ''}
                </div>

                <div id="nomina-view-content"></div>
            </div>
        `;

        const backBtn = document.getElementById('btn-nomina-back');
        if (backBtn) backBtn.onclick = () => this.showTab('home');
    },

    async showTab(tab) {
        this.currentTab = tab;
        this.renderLayout();
        const content = document.getElementById('nomina-view-content');

        if (tab === 'home') this.renderHome(content);
        else if (tab === 'dashboard') await this.renderDashboard(content);
        else if (tab === 'carga') await this.renderCarga(content);
        else if (tab === 'ejecucion') await this.renderEjecucion(content);
        else if (tab === 'conciliacion') await this.renderConciliacion(content);
    },

    renderHome(container) {
        container.innerHTML = `
            <div class="luxury-grid">
                <div class="span-6 luxury-card" style="padding: 32px; display: flex; flex-direction: column; justify-content: space-between; min-height: 240px; cursor: pointer; border-left: 4px solid var(--secondary); transition: transform 0.2s;" onclick="window.nominaModule.showTab('dashboard')">
                    <div>
                        <div style="width: 48px; height: 48px; background: #EEF2FF; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">📊</div>
                        <h3 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 12px 0;">Dashboard Real</h3>
                        <p style="font-size: 14px; color: #64748B; line-height: 1.6;">Análisis estratégico de la nómina liquidada. Comparativas, evolución y distribución real.</p>
                    </div>
                    <span style="color: var(--secondary); font-weight: 700; font-size: 13px;">Explorar Datos →</span>
                </div>

                <div class="span-6 luxury-card" style="padding: 32px; display: flex; flex-direction: column; justify-content: space-between; min-height: 240px; cursor: pointer; border-left: 4px solid #10B981; transition: transform 0.2s;" onclick="window.nominaModule.showTab('carga')">
                    <div>
                        <div style="width: 48px; height: 48px; background: #ECFDF5; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">📤</div>
                        <h3 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 12px 0;">Carga de Nómina</h3>
                        <p style="font-size: 14px; color: #64748B; line-height: 1.6;">Sube archivos CSV mensuales de Novasoft para alimentar la base de datos real del sistema.</p>
                    </div>
                    <span style="color: #10B981; font-weight: 700; font-size: 13px;">Gestionar Cargas →</span>
                </div>

                <div class="span-6 luxury-card" style="padding: 32px; display: flex; flex-direction: column; justify-content: space-between; min-height: 240px; cursor: pointer; border-left: 4px solid #F59E0B; transition: transform 0.2s;" onclick="window.nominaModule.showTab('ejecucion')">
                    <div>
                        <div style="width: 48px; height: 48px; background: #FFFBEB; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">💰</div>
                        <h3 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 12px 0;">Reporte FDEC</h3>
                        <p style="font-size: 14px; color: #64748B; line-height: 1.6;">Distribución del gasto real agrupado por Fondos de Destinación Específica y rubros.</p>
                    </div>
                    <span style="color: #F59E0B; font-weight: 700; font-size: 13px;">Ver Reporte →</span>
                </div>

                <div class="span-6 luxury-card" style="padding: 32px; display: flex; flex-direction: column; justify-content: space-between; min-height: 240px; cursor: pointer; border-left: 4px solid #8B5CF6; transition: transform 0.2s;" onclick="window.nominaModule.showTab('conciliacion')">
                    <div>
                        <div style="width: 48px; height: 48px; background: #F5F3FF; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">⚖️</div>
                        <h3 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 12px 0;">Conciliación</h3>
                        <p style="font-size: 14px; color: #64748B; line-height: 1.6;">Cruce automático entre lo pagado en Novasoft y lo proyectado en el presupuesto de Bosque.</p>
                    </div>
                    <span style="color: #8B5CF6; font-weight: 700; font-size: 13px;">Ejecutar Auditoría →</span>
                </div>
            </div>

            <div class="luxury-card mt-8" style="background: rgba(248, 250, 252, 0.5);">
                <h4 style="font-size: 13px; font-weight: 700; text-transform: uppercase; color: #94A3B8; margin-bottom: 16px; letter-spacing: 0.05em;">Resumen de Últimos Periodos</h4>
                <div id="nomina-mini-summary"></div>
            </div>
        `;

        this.renderMiniSummary();
    },

    async renderDashboard(container, filters = {}) {
        try {
            ui.showLoading("Cargando Dashboard Real...");
            const anio = new Date().getFullYear();
            let url = `/admin/nomina/dashboard?anio=${anio}`;
            if (filters.period) url += `&periodo=${filters.period}`;
            if (filters.worker) url += `&trabajador=${encodeURIComponent(filters.worker)}`;
            if (filters.direction) url += `&direccion=${encodeURIComponent(filters.direction)}`;

            const data = await api.get(url);
            ui.hideLoading();
            console.log("DEBUG NOMINA DATA:", data);

            if (!data.ok) throw new Error("No se pudo cargar el dashboard");

            // Fallback for missing filters to avoid crash
            if (!data.filters) {
                console.warn("Backend missing 'filters' key. Using empty fallbacks.");
                data.filters = { periods: [], directions: [] };
            }

            this.dashboardData = data;

            container.innerHTML = `
                <style>
                    .nomina-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
                    .nomina-chart-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-bottom: 32px; }
                    .mini-card { background: white; padding: 24px; border-radius: 20px; border: 1px solid #F1F5F9; }
                    .bar-container { height: 8px; background: #F1F5F9; border-radius: 4px; overflow: hidden; margin-top: 8px; }
                    .bar-fill { height: 100%; background: var(--primary); border-radius: 4px; }
                    
                    .worker-group-header { 
                        background: #F8FAFC; 
                        padding: 12px 16px; 
                        font-weight: 800; 
                        color: var(--primary-dark); 
                        border-bottom: 2px solid #E2E8F0;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .filter-bar-nomina {
                        display: grid;
                        grid-template-columns: 2fr 1fr 1fr 120px;
                        gap: 16px;
                        align-items: flex-end;
                    }
                </style>

                <div class="nomina-kpi-grid">
                    ${this.renderMiniKPI("Total Gastado", ui.money(data.kpis.total_pagado), "💰", "#F09819")}
                    ${this.renderMiniKPI("Trabajadores", data.kpis.n_empleados, "👥", "#3B82F6")}
                    ${this.renderMiniKPI("Promedio Mensual", ui.money(data.kpis.promedio_mensual), "📊", "#10B981")}
                    ${this.renderMiniKPI("Meses Cargados", data.kpis.meses_cargados, "📅", "#8B5CF6")}
                </div>

                <div class="nomina-chart-grid">
                    <div class="mini-card">
                        <h4 style="font-size: 14px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 20px;">Distribución por Dirección</h4>
                        <div id="nomina-dist-direccion"></div>
                    </div>
                    <div class="mini-card">
                        <h4 style="font-size: 14px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 20px;">Top 10 Proyectos (Gasto Real)</h4>
                        <div id="nomina-dist-proyectos"></div>
                    </div>
                </div>

                <div class="mini-card" style="margin-bottom: 24px;">
                    <h4 style="font-size: 14px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 20px;">Ejecución por Proyecto (Mensual)</h4>
                    <div id="nomina-matrix-container" style="overflow-x: auto;"></div>
                </div>

                <div class="filter-bar-nomina luxury-card" style="margin-bottom: 24px; border-left: 4px solid var(--secondary);">
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #94A3B8; display: block; margin-bottom: 4px;">FILTRAR DETALLE POR TRABAJADOR</label>
                        <input type="text" id="dash-filter-worker" placeholder="Cédula o Nombre..." value="${filters.worker || ''}" 
                               style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #E2E8F0; font-weight: 600;">
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #94A3B8; display: block; margin-bottom: 4px;">DIRECCIÓN</label>
                        <select id="dash-filter-direction" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #E2E8F0; font-weight: 600;">
                            <option value="">Todas las Direcciones</option>
                            ${data.filters.directions.map(d => `<option value="${d}" ${d === filters.direction ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 10px; font-weight: 800; color: #94A3B8; display: block; margin-bottom: 4px;">PERIODO (GLOBAL)</label>
                        <select id="dash-filter-period" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #E2E8F0; font-weight: 600;">
                            <option value="">Año Completo</option>
                            ${data.filters.periods.map(p => `<option value="${p}" ${p === filters.period ? 'selected' : ''}>${p}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display: flex; align-items: flex-end;">
                        <button id="btn-apply-filters" class="btn btn-primary" style="width: 100%; height: 42px; font-weight: 800;">Filtrar</button>
                    </div>
                </div>

                <div class="mini-card" style="padding: 0; overflow: hidden;">
                    <div style="padding: 24px; border-bottom: 1px solid #F1F5F9;">
                        <h4 style="font-size: 14px; font-weight: 800; color: #1E293B; margin: 0;">Detalle Agrupado por Trabajador</h4>
                        <p style="font-size: 11px; color: #94A3B8; margin: 4px 0 0 0;">Inversión real por cada contrato y proyecto</p>
                    </div>
                    <div style="max-height: 800px; overflow-y: auto;">
                        ${this.renderGroupedTable(data.detalle)}
                    </div>
                </div>
            `;

            this.renderDist('nomina-dist-direccion', data.charts.direccion);
            this.renderDist('nomina-dist-proyectos', data.charts.proyectos);
            this.renderProjectMatrix(data.matrix, data.periods);

            // Bind filters
            // Bind filters
            const applyFilters = () => {
                const w = document.getElementById('dash-filter-worker').value;
                const d = document.getElementById('dash-filter-direction').value;
                const p = document.getElementById('dash-filter-period').value;
                console.log("Applying filters:", { worker: w, direction: d, period: p });
                this.renderDashboard(container, { worker: w, direction: d, period: p });
            };

            document.getElementById('dash-filter-worker').onkeypress = (e) => {
                if (e.key === 'Enter') applyFilters();
            };
            document.getElementById('btn-apply-filters').onclick = applyFilters;
            document.getElementById('dash-filter-direction').onchange = applyFilters;
            document.getElementById('dash-filter-period').onchange = applyFilters;

        } catch (e) {
            console.error(e);
            ui.hideLoading();
            container.innerHTML = `<div class="luxury-card" style="text-align: center; color: #EF4444;"><p>Error cargando dashboard: ${e.message}</p></div>`;
        }
    },

    renderProjectMatrix(matrix, periods) {
        const container = document.getElementById('nomina-matrix-container');
        if (!container) return;

        if (!matrix || matrix.length === 0) {
            container.innerHTML = `<p style="color: #94A3B8;">No hay datos de ejecución por proyectos.</p>`;
            return;
        }

        // 1. Build lookup map: project -> period -> total
        const map = {};
        const projectTotals = {};

        matrix.forEach(m => {
            if (!map[m.proyecto]) map[m.proyecto] = {};
            map[m.proyecto][m.periodo] = m.total;

            // Track total per project for sorting
            projectTotals[m.proyecto] = (projectTotals[m.proyecto] || 0) + m.total;
        });

        // 2. Get unique projects and SORT by total DESC
        const projects = Object.keys(projectTotals).sort((a, b) => projectTotals[b] - projectTotals[a]);

        // 3. Render Table
        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse; font-family: 'Outfit', sans-serif; font-size: 12px;">
                <thead>
                    <tr style="border-bottom: 2px solid #E2E8F0;">
                        <th style="text-align: left; padding: 12px; color: #64748B; font-weight: 800;">PROYECTO</th>
                        ${periods.map(p => `<th style="text-align: right; padding: 12px; color: #64748B; font-weight: 800;">${p}</th>`).join('')}
                        <th style="text-align: right; padding: 12px; color: #0F172A; font-weight: 800;">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    ${projects.map(proj => {
            const rowTotal = projectTotals[proj];
            return `
                            <tr class="hover-row" style="border-bottom: 1px solid #F1F5F9;">
                                <td style="padding: 10px 12px; font-weight: 600; color: #334155;">${proj}</td>
                                ${periods.map(p => {
                const val = map[proj]?.[p] || 0;
                return `<td style="text-align: right; padding: 10px 12px; color: ${val ? '#475569' : '#CBD5E1'};">${val ? ui.money(val) : '-'}</td>`;
            }).join('')}
                                <td style="text-align: right; padding: 10px 12px; font-weight: 800; color: #059669;">${ui.money(rowTotal)}</td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
        `;
    },

    renderGroupedTable(detalle) {
        if (!detalle || detalle.length === 0) return `<div style="padding: 40px; text-align: center; color: #94A3B8;">No hay registros que coincidan con los filtros.</div>`;

        // 1. Group by Employee
        const groups = {};
        detalle.forEach(r => {
            const nombreStr = r.nombre && r.nombre !== 'undefined' ? r.nombre : (r.cedula || "Desconocido");
            const key = `${r.cedula}|${nombreStr}`;
            if (!groups[key]) groups[key] = { rows: [], total: 0 };
            groups[key].rows.push(r);
            groups[key].total += r.pagado;
        });

        const sortedWorkers = Object.keys(groups).sort((a, b) => {
            const nameA = a.split('|')[1].toLowerCase();
            const nameB = b.split('|')[1].toLowerCase();
            return nameA.localeCompare(nameB);
        });

        let html = `
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-family: 'Outfit', sans-serif;">
                <thead>
                    <tr>
                        <th style="padding: 16px; text-align: left; color: #64748B; font-size: 11px; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid #E2E8F0;">Detalle de Inversión</th>
                        <th style="padding: 16px; text-align: right; color: #64748B; font-size: 11px; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid #E2E8F0;">Monto</th>
                        <th style="padding: 16px; text-align: center; width: 60px; border-bottom: 2px solid #E2E8F0;">Ver</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedWorkers.forEach(workerKey => {
            const [cedula, nombre] = workerKey.split('|');
            const displayName = nombre === 'undefined' || nombre === cedula ? 'Nombre No Registrado' : nombre;

            // Generate initials
            const initials = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

            // Group Header Row
            html += `
                <tr style="background: #F8FAFC;">
                    <td colspan="3" style="padding: 16px; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="width: 36px; height: 36px; background: #E0F2FE; color: #0369A1; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; border: 1px solid #BAE6FD;">
                                    ${initials}
                                </div>
                                <div>
                                    <div style="font-size: 14px; font-weight: 700; color: #0F172A;">${displayName}</div>
                                    <div style="font-size: 11px; color: #64748B; font-family: monospace; letter-spacing: 0.05em;">${cedula}</div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 14px; font-weight: 800; color: #059669; font-variant-numeric: tabular-nums;">${ui.money(groups[workerKey].total)}</div>
                                <div style="font-size: 10px; color: #94A3B8; text-transform: uppercase; font-weight: 600;">Total Acumulado</div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;

            // Detail Rows
            groups[workerKey].rows.forEach(r => {
                html += `
                    <tr class="hover-row" style="background: white;">
                        <td style="padding: 12px 16px 12px 64px; border-bottom: 1px solid #F1F5F9;">
                            <div style="font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">${r.proyecto}</div>
                            <div style="font-size: 11px; color: #94A3B8; display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 10px;">🧩</span> ${r.component}
                            </div>
                        </td>
                        <td style="padding: 12px 16px; text-align: right; border-bottom: 1px solid #F1F5F9; font-variant-numeric: tabular-nums; font-size: 13px; color: #475569; font-weight: 500;">
                            ${ui.money(r.pagado)}
                        </td>
                        <td style="padding: 12px 16px; text-align: center; border-bottom: 1px solid #F1F5F9;">
                             <button onclick="window.navigateToConsulta('${cedula}')" class="btn btn-ghost btn-sm" style="padding: 6px; color: #3B82F6; background: #EFF6FF; border-radius: 8px;" title="Ir a Consulta Individual">
                                ➔
                            </button>
                        </td>
                    </tr>
                `;
            });
        });

        html += `</tbody></table>`;
        return html;
    },

    renderMiniKPI(title, value, icon, color) {
        return `
            <div class="mini-card" style="display: flex; align-items: center; gap: 16px;">
                <div style="width: 48px; height: 48px; border-radius: 12px; background: ${color}15; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                    ${icon}
                </div>
                <div>
                    <div style="font-size: 11px; font-weight: 800; color: #94A3B8; text-transform: uppercase;">${title}</div>
                    <div style="font-size: 18px; font-weight: 800; color: #0F172A;">${value}</div>
                </div>
            </div>
    `;
    },

    renderDist(id, data) {
        const container = document.getElementById(id);
        if (!container) return;

        const max = Math.max(...data.map(d => d.value));
        container.innerHTML = data.map(d => {
            const pct = (d.value / max) * 100;
            return `
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 4px;">
                        <span style="color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%;">${d.label || 'N/A'}</span>
                        <span style="color: #0F172A;">${ui.money(d.value)}</span>
                    </div>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>
    `;
        }).join('');
    },

    renderMiniSummary() {
        const target = document.getElementById('nomina-mini-summary');
        if (!target) return;
        if (!this.summary || this.summary.length === 0) {
            target.innerHTML = `<p style="color: #94A3B8; font-style: italic;">No hay periodos cargados.</p>`;
            return;
        }

        target.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        ${this.summary.slice(0, 4).map(s => {
            const p = s.periodo || s.fec_liq || 'Sin Periodo';
            return `
                        <div style="background: white; padding: 16px; border-radius: 12px; border: 1px solid #E2E8F0;">
                            <div style="font-size: 11px; font-weight: 800; color: #64748B; margin-bottom: 4px;">${p}</div>
                            <div style="font-size: 16px; font-weight: 800; color: var(--primary);">${ui.money(s.total)}</div>
                            <div style="font-size: 10px; color: #94A3B8; margin-top: 4px;">${s.registros.toLocaleString()} registros</div>
                        </div>
                    `;
        }).join('')
            }
            </div>
    `;
    },

    async renderCarga(container) {
        container.innerHTML = `
            <div class="flex justify-between align-center mb-6">
                <h3 style="font-size: 20px; font-weight: 800; color: #1E293B; margin: 0;">📤 Historial de Cargas CSV</h3>
                <div class="flex gap-4">
                    <input type="file" id="nomina-file-input" accept=".csv" style="display: none;">
                    <button id="btn-upload-nomina" class="btn btn-primary" style="background: var(--primary); padding: 10px 24px; font-weight: 800;">
                        + Subir Nuevo Archivo
                    </button>
                </div>
            </div>

    <div class="luxury-card">
        <div id="nomina-summary-table">
            <p style="text-align: center; padding: 40px; color: #94A3B8;">Cargando historial...</p>
        </div>
    </div>
`;

        const btn = document.getElementById('btn-upload-nomina');
        if (btn) btn.onclick = () => document.getElementById('nomina-file-input').click();
        const input = document.getElementById('nomina-file-input');
        if (input) input.onchange = (e) => this.handleUpload(e);

        await this.fetchSummary();
    },

    async fetchSummary(silent = false) {
        try {
            const data = await api.get('/admin/nomina/summary');
            this.summary = data || [];
            if (silent) return;

            const container = document.getElementById('nomina-summary-table');
            if (!container) return;

            if (this.summary.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 48px; color: #64748B;">No hay datos de nómina cargados.</div>`;
                return;
            }

            container.innerHTML = `
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="text-align: left; border-bottom: 2px solid #F1F5F9;">
                            <th style="padding: 12px; font-size: 12px; color: #64748B;">PERIODO</th>
                            <th style="padding: 12px; font-size: 12px; color: #64748B;">TOTAL PAGADO</th>
                            <th style="padding: 12px; font-size: 12px; color: #64748B;">REGISTROS</th>
                            <th style="padding: 12px; font-size: 12px; color: #64748B;">ÚLTIMA CARGA</th>
                            <th style="padding: 12px; font-size: 12px; color: #64748B; text-align: right;">ACCIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.summary.map(s => {
                const p = s.periodo || s.fec_liq || 'Sin Periodo';
                return `
                            <tr class="hover-row" style="border-bottom: 1px solid #F1F5F9;">
                                <td style="padding: 16px 12px; font-weight: 800; font-size: 15px;">${p}</td>
                                <td style="padding: 16px 12px; font-weight: 800; color: #059669;">${ui.money(s.total)}</td>
                                <td style="padding: 16px 12px; color: #475569;">${s.registros.toLocaleString()}</td>
                                <td style="padding: 16px 12px; font-size: 12px; color: #94A3B8;">${new Date(s.ultima_carga).toLocaleString()}</td>
                                <td style="padding: 16px 12px; text-align: right;">
                                    <button onclick="window.nominaModule.deleteMonth('${p}')" class="btn btn-ghost" style="color: #EF4444; font-size: 12px; font-weight: 700;">🗑️ Borrar</button>
                                </td>
                            </tr>
                            `;
            }).join('')}
                    </tbody>
                </table>
            `;
            window.nominaModule = this;
        } catch (e) {
            ui.showToast("Error al cargar resumen", "error");
        }
    },

    async renderEjecucion(container) {
        const periodos = this.summary.map(s => s.periodo || s.fec_liq).filter(p => p);
        const selPeriodo = periodos[0] || '';

        container.innerHTML = `
            <div class="luxury-card mb-6" style="background: #F8FAFC; border: 1px solid #E2E8F0;">
                <div class="flex justify-between align-center">
                    <div>
                        <h3 style="font-size: 18px; font-weight: 800; color: #1E293B; margin: 0;">Análisis por Fondo (FDEC)</h3>
                        <p style="font-size: 13px; color: #64748B;">Distribución del rubro personal por fondo de destinación.</p>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <label style="font-size: 12px; font-weight: 700; color: #64748B;">Periodo:</label>
                        <select id="ejec-periodo-select" style="padding: 8px 16px; border-radius: 10px; border: 1px solid #CBD5E1; font-weight: 700;">
                            ${periodos.map(p => `<option value="${p}">${p}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <div id="ejecucion-fdec-results">
                <p style="text-align: center; padding: 40px; color: #94A3B8;">Seleccione un periodo para ver el reporte.</p>
            </div>
        `;

        const select = document.getElementById('ejec-periodo-select');
        if (select) {
            select.onchange = (e) => this.fetchEjecucionFDEC(e.target.value);
            if (selPeriodo) this.fetchEjecucionFDEC(selPeriodo);
        }
    },

    async fetchEjecucionFDEC(periodo) {
        if (!periodo) return;
        const target = document.getElementById('ejecucion-fdec-results');
        target.innerHTML = `<p style="text-align: center; padding: 60px; color: #94A3B8;">Analizando datos del periodo ${periodo}...</p>`;

        try {
            const data = await api.get(`/admin/nomina/ejecucion/fdec?periodo=${periodo}`);
            if (data.length === 0) {
                target.innerHTML = `<div style="text-align: center; padding: 40px; color: #64748B;">No hay registros para este periodo.</div>`;
                return;
            }

            const totalGlobal = data.reduce((acc, curr) => acc + curr.total, 0);

            target.innerHTML = `
                <div class="luxury-card">
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="text-align: left; border-bottom: 2px solid #F1F5F9;">
                    <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Fondo de Destinación (FDEC)</th>
                    <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Barra de Peso</th>
                    <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; text-align: right;">Personas</th>
                    <th style="padding: 12px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase; text-align: right;">Total Liquidado</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(d => {
                const pct = (d.total / totalGlobal * 100).toFixed(1);
                return `
                                <tr class="hover-row" style="border-bottom: 1px solid #F8FAFC;">
                                    <td style="padding: 16px 12px; font-weight: 700; color: var(--primary-dark); font-size: 14px;">${d.fdec || 'Sin FDEC asignado'}</td>
                                    <td style="padding: 16px 12px; width: 200px;">
                                        <div style="width: 100%; background: #F1F5F9; height: 6px; border-radius: 10px; overflow: hidden;">
                                            <div style="width: ${pct}%; background: var(--primary); height: 100%;"></div>
                                        </div>
                                        <div style="font-size: 10px; color: #94A3B8; margin-top: 4px;">${pct}% del total mensual</div>
                                    </td>
                                    <td style="padding: 16px 12px; text-align: right; font-weight: 600; color: #475569;">${d.personas}</td>
                                    <td style="padding: 16px 12px; text-align: right; font-weight: 800; color: #0369A1; font-size: 15px;">${ui.money(d.total)}</td>
                                </tr>
                                `;
            }).join('')}
            </tbody>
            <tfoot>
                <tr style="background: #F8FAFC; font-weight: 800;">
                    <td colspan="3" style="padding: 20px 12px; text-align: right; font-size: 14px;">TOTAL PERIODO:</td>
                    <td style="padding: 20px 12px; text-align: right; font-size: 18px; color: var(--primary-dark);">${ui.money(totalGlobal)}</td>
                </tr>
            </tfoot>
        </table>
                </div>
            `;
        } catch (e) {
            target.innerHTML = `<div style="text-align: center; color: #EF4444; padding: 40px;">Error al cargar datos del reporte FDEC.</div>`;
        }
    },

    async renderConciliacion(container) {
        const periodos = this.summary.map(s => s.periodo || s.fec_liq).filter(p => p);
        const safeVersions = this.versions || [];

        container.innerHTML = `
            <div class="luxury-card mb-8" style="background: #F8FAFC; border: 1px solid #E2E8F0;">
                <h3 style="font-size: 18px; font-weight: 800; color: #0F172A; margin-bottom: 20px;">⚖️ Conciliación de Brechas</h3>
                <div style="display: grid; grid-template-columns: 1fr 1.5fr auto; gap: 20px; align-items: flex-end;">
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 700; color: #64748B; margin-bottom: 6px; text-transform: uppercase;">1. Periodo Nómina Real</label>
                        <select id="conc-periodo-select" style="width: 100%; padding: 12px; border-radius: 12px; border: 1px solid #CBD5E1; font-weight: 600; font-family: 'Outfit';">
                            ${periodos.length > 0 ? periodos.map(p => `<option value="${p}">${p}</option>`).join('') : '<option disabled>Sin datos de nómina</option>'}
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 700; color: #64748B; margin-bottom: 6px; text-transform: uppercase;">2. Versión de Presupuesto (Snapshot)</label>
                        <select id="conc-version-select" style="width: 100%; padding: 12px; border-radius: 12px; border: 1px solid #CBD5E1; font-weight: 600; font-family: 'Outfit';">
                            <option value="0" style="font-weight: 800; color: #059669;">BFinanciacion (Actual / Vivo)</option>
                            ${safeVersions.length > 0 ? safeVersions.map(v => {
            const f = v.fecha ? v.fecha.split('T')[0] : 'Sin fecha';
            return `<option value="${v.id}">${v.nombre || 'Versión'} (${f})</option>`;
        }).join('') : ''}
                        </select>
                    </div>
                    <div>
                        <button id="btn-run-conciliacion" class="btn" style="padding: 12px 32px; font-weight: 800; background: #059669; color: white; border-radius: 12px; border: none; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.2);">
                            Auditar Diferencias
                        </button>
                    </div>
                </div>
            </div>

            <div id="conciliacion-results">
                <div style="text-align: center; padding: 80px; background: white; border-radius: 24px; border: 2px dashed #E2E8F0;">
                    <span style="font-size: 48px; display: block; margin-bottom: 16px;">🔍</span>
                    <h3 style="font-size: 18px; font-weight: 800; color: #1E293B;">Listo para conciliar</h3>
                    <p style="color: #64748B; font-size: 14px;">Selecciona los parámetros arriba para comparar lo pagado contra lo proyectado.</p>
                </div>
            </div>
`;

        const btnRun = document.getElementById('btn-run-conciliacion');
        if (btnRun) {
            btnRun.onclick = () => {
                const p = document.getElementById('conc-periodo-select').value;
                const v = document.getElementById('conc-version-select').value;
                if (!p || !v || p.includes('Sin') || v.includes('Sin')) {
                    ui.showToast("Debes seleccionar periodo y versión válidos", "error");
                    return;
                }
                this.fetchConciliacion(p, v);
            };
        }
    },

    async fetchConciliacion(periodo, version_id) {
        const target = document.getElementById('conciliacion-results');
        target.innerHTML = `
            <div style="text-align: center; padding: 60px;">
                <div class="loader-spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--primary); border-radius: 50%; margin: 0 auto 16px auto; animation: spin 1s linear infinite;"></div>
                <p style="font-weight: 700; color: var(--primary);">Realizando conciliación masiva...</p>
                <p style="font-size: 12px; color: #94A3B8;">Cruzando registros por cédula y proyecto.</p>
            </div>
    `;

        try {
            const data = await api.get(`/admin/nomina/reconciliation?version_id=${version_id}&periodo=${periodo}`);

            // Stats
            const totalPres = data.reduce((acc, curr) => acc + curr.presupuestado, 0);
            const totalPagado = data.reduce((acc, curr) => acc + curr.pagado, 0);
            const brechaGlobal = totalPagado - totalPres;

            target.innerHTML = `
                <div class="luxury-grid mb-8" style="gap: 24px;">
                    <div class="span-4 luxury-card" style="padding: 24px; border-bottom: 4px solid #CBD5E1;">
                        <label style="font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Presupuestado (FOTO)</label>
                        <div style="font-size: 24px; font-weight: 800; color: #1E293B; margin-top: 8px;">${ui.money(totalPres)}</div>
                    </div>
                    <div class="span-4 luxury-card" style="padding: 24px; border-bottom: 4px solid #059669;">
                        <label style="font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Pagado Real (NÓMINA)</label>
                        <div style="font-size: 24px; font-weight: 800; color: #059669; margin-top: 8px;">${ui.money(totalPagado)}</div>
                    </div>
                    <div class="span-4 luxury-card" style="padding: 24px; border-bottom: 4px solid ${brechaGlobal > 0 ? '#EF4444' : '#10B981'}; background: ${brechaGlobal > 0 ? '#FEF2F2' : '#F0FDF4'};">
                        <label style="font-size: 10px; font-weight: 800; color: ${brechaGlobal > 0 ? '#991B1B' : '#166534'}; text-transform: uppercase;">Brecha Total</label>
                        <div style="font-size: 24px; font-weight: 900; color: ${brechaGlobal > 0 ? '#B91C1C' : '#15803D'}; margin-top: 8px;">${ui.money(brechaGlobal)}</div>
                    </div>
                </div>

                <div class="luxury-card">
                    <div class="flex justify-between align-center mb-6">
                        <h4 style="font-size: 15px; font-weight: 800; color: #1E293B;">Trazabilidad por Granularidad (Agrupado por Proyecto)</h4>
                        <div style="font-size: 12px; color: #64748B; font-weight: 600;">
                            Cruce por: Cédula + Proyecto + Fuente + Responsable
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead>
                                <tr style="text-align: left; border-bottom: 2px solid #F1F5F9; background: #F8FAFC;">
                                    <th style="padding: 12px; width: 40px;"></th>
                                    <th style="padding: 12px;">PROYECTO / FUENTE</th>
                                    <th style="padding: 12px; text-align: right;">PRESUPUESTADO</th>
                                    <th style="padding: 12px; text-align: right;">PAGADO REAL</th>
                                    <th style="padding: 12px; text-align: right;">BRECHA</th>
                                    <th style="padding: 12px; text-align: right;">% CUMP.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(() => {
                    // 1. Group data by Project
                    const groups = {};
                    data.forEach(r => {
                        const pid = r.cod_proyecto || 'S_P';
                        if (!groups[pid]) groups[pid] = { rows: [], pres: 0, pag: 0 };
                        groups[pid].rows.push(r);
                        groups[pid].pres += r.presupuestado;
                        groups[pid].pag += r.pagado;
                    });

                    // 2. Sort projects by pagado DESC
                    const sortedPids = Object.keys(groups).sort((a, b) => groups[b].pag - groups[a].pag);

                    return sortedPids.map((pid, idx) => {
                        const g = groups[pid];
                        const brecha = g.pag - g.pres;
                        const cumpl = g.pres > 0 ? (g.pag / g.pres * 100) : 0;
                        const variant = brecha > 1000 ? '#EF4444' : (brecha < -1000 ? '#3B82F6' : '#64748B');

                        return `
                                            <!-- Project Row -->
                                            <tr style="border-bottom: 1px solid #E2E8F0; background: #FDFDFD; cursor: pointer;" 
                                                onclick="const el = document.getElementById('details-${idx}'); el.style.display = el.style.display === 'none' ? 'table-row-group' : 'none';">
                                                <td style="padding: 14px 12px; text-align: center; color: #94A3B8;">
                                                    <span style="font-size: 14px;">▶</span>
                                                </td>
                                                <td style="padding: 14px 12px;">
                                                    <div style="font-weight: 800; color: #0F172A; font-size: 13px;">${this.getName('proyectos', pid)}</div>
                                                    <div style="font-size: 10px; color: #64748B;">${g.rows.length} registros asociados</div>
                                                </td>
                                                <td style="padding: 14px 12px; text-align: right; color: #64748B; font-weight: 600;">${ui.money(g.pres)}</td>
                                                <td style="padding: 14px 12px; text-align: right; font-weight: 800; color: #0F172A; font-size: 13px;">${ui.money(g.pag)}</td>
                                                <td style="padding: 14px 12px; text-align: right; font-weight: 900; color: ${variant}; font-size: 13px;">
                                                    ${brecha > 0 ? '+' : ''}${ui.money(brecha)}
                                                </td>
                                                <td style="padding: 14px 12px; text-align: right;">
                                                    <span style="padding: 6px 10px; border-radius: 8px; background: #F1F5F9; font-weight: 900; font-size: 11px; color: ${cumpl > 105 ? '#EF4444' : (cumpl < 95 ? '#3B82F6' : '#059669')};">
                                                        ${cumpl.toFixed(1)}%
                                                    </span>
                                                </td>
                                            </tr>
                                            <!-- Details Section (Hidden by default) -->
                                            <tbody id="details-${idx}" style="display: none; background: #FAFAFA; border-left: 4px solid #E2E8F0;">
                                                <tr style="background: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                                                    <th style="padding: 10px 12px;"></th>
                                                    <th style="padding: 12px; color: #475569; text-align: left; font-size: 11px; text-transform: uppercase;">Trabajador</th>
                                                    <th style="padding: 12px; color: #475569; text-align: right; font-size: 11px; text-transform: uppercase;">Dimensión (Fuente/Resp)</th>
                                                    <th style="padding: 12px; color: #475569; text-align: right; font-size: 11px; text-transform: uppercase; background: #ECFDF5;">Proyectado</th>
                                                    <th style="padding: 12px; color: #475569; text-align: right; font-size: 11px; text-transform: uppercase; background: #EFF6FF;">Pagado Real</th>
                                                    <th style="padding: 12px; color: #475569; text-align: right; font-size: 11px; text-transform: uppercase;">Diferencia</th>
                                                    <th></th>
                                                </tr>
                                                ${g.rows.map(r => {
                            const r_brecha = r.pagado - r.presupuestado;
                            const r_variant = r_brecha > 1000 ? '#EF4444' : (r_brecha < -1000 ? '#3B82F6' : '#64748B');
                            return `
                                                        <tr style="border-bottom: 1px solid #F1F5F9;">
                                                            <td></td>
                                                            <td style="padding: 12px;">
                                                                <div style="font-weight: 700; color: #1E293B; font-size: 12px;">${r.nombre || 'Sin nombre'}</div>
                                                                <div style="font-family: monospace; font-size: 10px; color: #64748B;">ID: ${r.cedula}</div>
                                                            </td>
                                                            <td style="padding: 12px; text-align: right; font-size: 10px; color: #64748B;">
                                                                <div style="font-weight: 600;">${this.getName('fuentes', r.cod_fuente)}</div>
                                                                <div style="font-size: 9px; color: #94A3B8;">RESP: ${this.getName('responsables', r.cod_responsable)}</div>
                                                            </td>
                                                            <td style="padding: 12px; text-align: right; font-weight: 600; color: #059669; background: #F0FDF4;">${ui.money(r.presupuestado)}</td>
                                                            <td style="padding: 12px; text-align: right; font-weight: 800; color: #2563EB; background: #F8FAFF;">${ui.money(r.pagado)}</td>
                                                            <td style="padding: 12px; text-align: right; font-weight: 700; color: ${r_variant};">
                                                                <div style="font-size: 12px;">${r_brecha > 0 ? '+' : ''}${ui.money(r_brecha)}</div>
                                                                <div style="font-size: 10px; opacity: 0.7;">${r.presupuestado > 0 ? r.cumplimiento.toFixed(1) + '%' : 'No proyectado'}</div>
                                                            </td>
                                                            <td></td>
                                                        </tr>
                                                    `;
                        }).join('')}
                                            </tbody>
                                        `;
                    }).join('');
                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            target.innerHTML = `<div style="text-align: center; color: #EF4444; padding: 60px;">Error ejecutando conciliación: ${e.message}</div>`;
        }
    },

    getName(listName, id) {
        if (!this.catalogs || !this.catalogs[listName]) return id || '-';
        // Check both potential list formats (id/nombre or codigo/nombre)
        const item = this.catalogs[listName].find(x => String(x.id) === String(id) || String(x.codigo) === String(id));
        return item ? (item.nombre || item.name) : (id || '-');
    },

    async handleUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            ui.showLoading("Procesando masivamente la nómina...");
            const res = await api.upload('/admin/nomina/upload', formData);
            if (res.ok) {
                ui.showToast(res.message, "success");
                await this.fetchSummary();
            } else {
                ui.showToast(res.detail || "Error al subir", "error");
            }
        } catch (err) {
            ui.showToast(err.message || "Error de conexión", "error");
        } finally {
            e.target.value = '';
            ui.hideLoading();
        }
    },

    async deleteMonth(periodo) {
        ui.confirm('Eliminar Datos', `¿Estás seguro de que deseas eliminar TODOS los registros de nómina del periodo ${periodo}?`, async () => {
            try {
                ui.showLoading("Eliminando...");
                const res = await api.delete(`/admin/nomina/month/${periodo}`);
                if (res.ok) {
                    ui.showToast("Registros eliminados");
                    await this.fetchSummary();
                }
            } catch (err) {
                ui.showToast("Error al eliminar", "error");
            } finally {
                ui.hideLoading();
            }
        });
    }
};

window.nominaModule = nomina;
