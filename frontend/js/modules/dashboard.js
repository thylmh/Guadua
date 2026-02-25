/**
 * dashboard.js - Home/Dashboard View
 */
import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';
import { reporte } from './reporte.js';

export const dashboard = {
    selectedYear: new Date().getFullYear(),
    async render() {
        const container = document.getElementById('dashboard-view');

        const role = auth._user?.role;
        if (role !== 'admin' && role !== 'user' && role !== 'financiero' && role !== 'talento' && role !== 'nomina') {
            this.renderUserWelcome(container);
            return;
        }

        try {
            document.getElementById('loader').classList.remove('hidden');
            const data = await api.get(`/admin/dashboard-global?anio=${this.selectedYear}`);
            console.log("Dashboard Data Received:", data);
            document.getElementById('loader').classList.add('hidden');

            const { kpis, dist_planta, dist_direccion, dist_direccion_costo, missing_financing, underfunded_alerts, overlap_alerts, inconsistency_alerts } = data;
            const totalAlerts = missing_financing.length + (underfunded_alerts?.length || 0) + overlap_alerts.length + (inconsistency_alerts?.length || 0);

            container.innerHTML = `
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
                    #dashboard-view * { font-family: 'Outfit', sans-serif; }
                    
                    .dashboard-content { padding: 32px 40px; max-width: 1400px; margin: 0 auto; }
                    .dashboard-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .matrix-card { 
                        background: white; 
                        border-radius: 20px; 
                        border: 1px solid rgba(0,0,0,0.04); 
                        box-shadow: 0 10px 30px -5px rgba(0,0,0,0.03); 
                        padding: 32px;
                        margin-bottom: 32px;
                    }
                    .matrix-table { width: 100%; border-collapse: separate; border-spacing: 0; }
                    .matrix-table th { 
                        background: #F8FAFC; 
                        padding: 14px 8px; 
                        font-size: 10px; 
                        font-weight: 800; 
                        color: #64748B; 
                        text-transform: uppercase; 
                        letter-spacing: 0.1em;
                        border-bottom: 1px solid #E2E8F0;
                    }
                    .matrix-table td { padding: 12px 8px; font-size: 11px; border-bottom: 1px solid #F1F5F9; }
                    .matrix-table tr:hover { background: #F8FAFC; }
                    .matrix-money { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; }
                    
                    .kpi-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 32px; }
                    .kpi-modern { 
                        background: white; padding: 28px; border-radius: 20px; 
                        border: 1px solid rgba(0,0,0,0.04); box-shadow: 0 4px 6px rgba(0,0,0,0.01);
                        display: flex; align-items: center; gap: 24px;
                        transition: transform 0.2s;
                    }
                    .kpi-modern:hover { transform: translateY(-4px); box-shadow: 0 12px 20px -5px rgba(0,0,0,0.05); }

                    .btn-consultar {
                        background: #0F172A;
                        color: white !important;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .btn-consultar:hover {
                        background: #1e293b;
                        transform: translateY(-1px);
                    }

                    .chart-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 32px; }
                    @media (max-width: 1100px) { .chart-grid-3 { grid-template-columns: 1fr; } }
                </style>

                <div class="dashboard-content">
                    <div class="dashboard-header">
                        <div>
                            <h1 style="font-size: 32px; font-weight: 800; color: #0F172A; letter-spacing: -0.04em; margin: 0;">Dashboard Global</h1>
                            <p style="color: #64748B; font-size: 14px; margin: 4px 0 0 0;">Análisis estratégico y proyecciones de inversión de nómina.</p>
                        </div>
                        <div class="flex gap-4 align-center">
                            <div style="background: white; border: 1px solid #E2E8F0; padding: 4px 12px; border-radius: 12px; display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 11px; font-weight: 800; color: #94A3B8; text-transform: uppercase;">Vigencia:</span>
                                <select id="dashboard-year-select" style="border: none; font-weight: 800; color: #0F172A; outline: none; cursor: pointer; background: transparent; font-size: 14px;">
                                    ${(data.available_years || [2026, 2027]).map(y => `<option value="${y}" ${y === this.selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
                                </select>
                            </div>
                            <button id="btn-master-report" class="btn-consultar" style="height: 48px; padding: 0 28px; font-size: 14px; background: #0F172A; color: white;">
                                 Reporte Listado Maestro →
                            </button>
                        </div>
                    </div>

                    <div class="kpi-container">
                        ${this.kpiModern('Trabajadores', kpis.n_empleados, '👥', '#3B82F6')}
                        ${this.kpiModern('Vigencia Proyectada', ui.money(kpis.costo_total), '💎', '#10B981')}
                        ${this.kpiModern('Inconsistencias', kpis.inconsistency_count || 0, '⚠️', '#F59E0B')}
                    </div>

                    <div class="chart-grid-3">
                        ${this.chartCard('Trabajadores por Planta', 'chart-planta', 'Distribución vinculados / financiados')}
                        ${this.chartCard('Distribución por Dirección', 'chart-dir-personas', 'Total trabajadores por área')}
                        ${this.chartCard('Inversión por Dirección', 'chart-dir-costo', 'Consolidado financiero proyectado')}
                    </div>

                    <div class="matrix-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                            <h3 style="font-size: 16px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
                                Proyección Anual de Costos 
                                <span style="color: #94A3B8; font-weight: 400; font-size: 14px; text-transform: none;">— Mensualizado ${this.selectedYear}</span>
                            </h3>
                            <div style="font-size: 11px; background: #F1F5F9; padding: 4px 12px; border-radius: 20px; color: #64748B; font-weight: 600;">Valores en Millones (M)</div>
                        </div>

                        <div style="overflow-x: auto; margin: 0 -32px; padding: 0 32px;">
                            <table class="matrix-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; position: sticky; left: 0; background: #F8FAFC; z-index: 5;">Proyecto / Fuente</th>
                                        ${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => `<th style="text-align: right;">${m}</th>`).join('')}
                                        <th style="text-align: right; color: #0F172A;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.matrix_proyectos ? data.matrix_proyectos.map(p => {
                const labelLower = p.label.toLowerCase();
                const isWarning = labelLower.includes('sin financiación') || labelLower.includes('sin financiacion');
                const isInfo = labelLower.includes('incorporación') || labelLower.includes('incorporacion');

                let textColor = '#334155';
                let bgColor = 'white';
                let icon = '• ';

                if (isWarning) {
                    textColor = '#EF4444';
                    bgColor = '#FEF2F2';
                    icon = '⚠ ';
                } else if (isInfo) {
                    textColor = '#3B82F6';
                    bgColor = '#EFF6FF';
                    icon = 'ℹ ';
                }

                return `
                                        <tr>
                                            <td style="font-weight: 600; color: ${textColor}; position: sticky; left: 0; background: ${bgColor}; z-index: 4;">
                                                ${icon}${p.label}
                                            </td>
                                            ${p.months.map(val => `<td class="text-right matrix-money" style="color: ${val > 0 ? '#475569' : '#E2E8F0'};">
                                                ${val > 0 ? ui.moneyCompact(val).replace(' M', 'M') : '—'}
                                            </td>`).join('')}
                                            <td class="text-right matrix-money" style="font-weight: 800; color: #0F172A; background: #F8FAFC;">
                                                ${ui.moneyCompact(p.total).replace(' M', 'M')}
                                            </td>
                                        </tr>
                                    `;
            }).join('') : ''}
                                </tbody>
                                <tfoot>
                                    ${(() => {
                    const colTotals = Array(12).fill(0);
                    let grandTotal = 0;
                    data.matrix_proyectos.forEach(p => {
                        p.months.forEach((m, i) => colTotals[i] += m);
                        grandTotal += p.total;
                    });
                    return `
                                        <tr style="background: #0F172A; color: white !important;">
                                            <td style="padding: 16px; font-weight: 800; background: #0F172A; color: white !important;">TOTAL CONSOLIDADO</td>
                                            ${colTotals.map(t => `<td class="text-right matrix-money" style="padding: 16px; color: #F8FAFC !important;">${ui.moneyCompact(t).replace(' M', 'M')}</td>`).join('')}
                                            <td class="text-right matrix-money" style="padding: 16px; color: #38BDF8 !important; font-size: 13px; font-weight: 800; background: #111827;">${ui.moneyCompact(grandTotal).replace(' M', 'M')}</td>
                                        </tr>
                                    `;
                })()}
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div class="matrix-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                            <h3 style="font-size: 16px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
                                Trabajadores Sin Financiación
                                <span style="color: #94A3B8; font-weight: 400; font-size: 14px; text-transform: none;">— Headcount Mensual A01/A02 (${this.selectedYear})</span>
                            </h3>
                        </div>

                        <div style="overflow-x: auto; margin: 0 -32px; padding: 0 32px;">
                            <table class="matrix-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; position: sticky; left: 0; background: #F8FAFC; z-index: 5;">Planta</th>
                                        ${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => `<th style="text-align: right;">${m}</th>`).join('')}
                                        <th style="text-align: right; color: #0F172A;">Total Único</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.matrix_sin_finan && data.matrix_sin_finan.length > 0 ? data.matrix_sin_finan.map(row => `
                                        <tr>
                                            <td style="font-weight: 600; color: #334155; position: sticky; left: 0; background: white; z-index: 4;">
                                                • ${row.label}
                                            </td>
                                            ${row.months.map(val => `<td class="text-right" style="font-weight: 700; color: ${val > 0 ? '#EF4444' : '#E2E8F0'}; font-size: 12px;">
                                                ${val > 0 ? val : '—'}
                                            </td>`).join('')}
                                            <td class="text-right" style="font-weight: 800; color: #0F172A; background: #F8FAFC; font-size: 13px;">
                                                ${row.total}
                                            </td>
                                        </tr>
                                    `).join('') : `<tr><td colspan="14" style="text-align: center; padding: 32px; color: #94A3B8;">No hay trabajadores en A01/A02 para este periodo.</td></tr>`}
                                </tbody>
                                <tfoot>
                                    ${(() => {
                    const colTotals = Array(12).fill(0);
                    let grandTotal = 0;
                    if (data.matrix_sin_finan) {
                        data.matrix_sin_finan.forEach(row => {
                            row.months.forEach((v, i) => colTotals[i] += v);
                        });
                        // The backend doesn't send the grand unique total directly, 
                        // but for global "Total" typically a sum of rows or re-calculating fits.
                        // Here we'll sum the monthly totals.
                    }
                    return `
                                            <tr style="background: #F8FAFC; border-top: 2px solid #E2E8F0;">
                                                <td style="padding: 12px; font-weight: 800; color: #0F172A;">TOTAL</td>
                                                ${colTotals.map(t => `<td class="text-right" style="padding: 12px; font-weight: 800; color: #0F172A; font-size: 12px;">${t || '—'}</td>`).join('')}
                                                <td class="text-right" style="padding: 12px; font-weight: 900; color: #EF4444; background: #FEF2F2; font-size: 13px;">
                                                    ${data.matrix_sin_finan ? data.matrix_sin_finan.reduce((acc, r) => acc + r.total, 0) : 0}
                                                </td>
                                            </tr>
                                        `;
                })()}
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <div class="matrix-card">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                            <h3 style="font-size: 16px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">
                                Costo de Trabajadores Sin Financiación
                                <span style="color: #94A3B8; font-weight: 400; font-size: 14px; text-transform: none;">— Proyección A01/A02 (${this.selectedYear})</span>
                            </h3>
                        </div>

                        <div style="overflow-x: auto; margin: 0 -32px; padding: 0 32px;">
                            <table class="matrix-table">
                                <thead>
                                    <tr>
                                        <th style="text-align: left; position: sticky; left: 0; background: #F8FAFC; z-index: 5;">Planta</th>
                                        ${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map(m => `<th style="text-align: right;">${m}</th>`).join('')}
                                        <th style="text-align: right; color: #0F172A;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.matrix_costo_sin_finan && data.matrix_costo_sin_finan.length > 0 ? data.matrix_costo_sin_finan.map(row => `
                                        <tr>
                                            <td style="font-weight: 600; color: #334155; position: sticky; left: 0; background: white; z-index: 4;">
                                                💰 ${row.label}
                                            </td>
                                            ${row.months.map(val => `<td class="text-right matrix-money" style="color: ${val > 0 ? '#475569' : '#E2E8F0'}; font-size: 11px;">
                                                ${val > 0 ? ui.moneyCompact(val).replace(' M', 'M') : '—'}
                                            </td>`).join('')}
                                            <td class="text-right matrix-money" style="font-weight: 800; color: #0F172A; background: #F8FAFC; font-size: 12px;">
                                                ${ui.moneyCompact(row.total).replace(' M', 'M')}
                                            </td>
                                        </tr>
                                    `).join('') : `<tr><td colspan="14" style="text-align: center; padding: 32px; color: #94A3B8;">No hay costos asociados a A01/A02 para este periodo.</td></tr>`}
                                </tbody>
                                <tfoot>
                                    ${(() => {
                    const colTotals = Array(12).fill(0);
                    let grandTotal = 0;
                    if (data.matrix_costo_sin_finan) {
                        data.matrix_costo_sin_finan.forEach(row => {
                            row.months.forEach((v, i) => colTotals[i] += v);
                            grandTotal += row.total;
                        });
                    }
                    return `
                                            <tr style="background: #F8FAFC; border-top: 2px solid #E2E8F0;">
                                                <td style="padding: 12px; font-weight: 800; color: #0F172A;">TOTAL</td>
                                                ${colTotals.map(t => `<td class="text-right matrix-money" style="padding: 12px; font-weight: 800; color: #0F172A; font-size: 11px;">${t > 0 ? ui.moneyCompact(t).replace(' M', 'M') : '—'}</td>`).join('')}
                                                <td class="text-right matrix-money" style="padding: 12px; font-weight: 900; color: #1E40AF; background: #EFF6FF; font-size: 12px;">
                                                    ${ui.moneyCompact(grandTotal).replace(' M', 'M')}
                                                </td>
                                            </tr>
                                        `;
                })()}
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    <!-- Alerts Section Moved to Bottom -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; margin-bottom: 32px;">
                        <!-- Inconsistencias -->
                        <div class="matrix-card" style="padding: 24px; margin-bottom: 0;">
                             <div class="flex justify-between align-center mb-6">
                                <h3 style="font-size: 14px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin: 0;">⚠️ Limpieza: Tramos vs Retiro</h3>
                                <span class="badge" style="background: #FFFBEB; color: #D97706; border: 1px solid #FEF3C7;">${inconsistency_alerts?.length || 0} casos</span>
                            </div>
                            <div style="display: grid; grid-gap: 12px; max-height: 250px; overflow-y: auto;">
                                ${!inconsistency_alerts || inconsistency_alerts.length === 0 ? '<p style="color: #94A3B8; font-size: 13px;">No hay inconsistencias.</p>' : inconsistency_alerts.map(m => `
                                    <div style="padding: 12px; border-radius: 12px; border: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; background: #FFFDF5;">
                                        <div>
                                            <div style="font-size: 12px; font-weight: 700; color: #0F172A;">${m.nombre}</div>
                                            <div style="font-size: 10px; color: #B45309; font-weight: 600;">${m.tipo}: ${m.msg}</div>
                                        </div>
                                        <button onclick="navigateToConsulta('${m.cedula}')" style="background: white; border: 1px solid #E2E8F0; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; color: #64748B;">→</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="matrix-card" style="padding: 24px; margin-bottom: 0;">
                             <div class="flex justify-between align-center mb-6">
                                <h3 style="font-size: 14px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin: 0;">🚨 Alerta: Sin financiación</h3>
                                <span class="badge" style="background: #FEF2F2; color: #EF4444; border: 1px solid #FEE2E2;">${missing_financing.length} casos</span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; max-height: 250px; overflow-y: auto;">
                                ${missing_financing.length === 0 ? '<p style="color: #94A3B8; font-size: 13px;">No hay alertas.</p>' : missing_financing.map(m => `
                                    <div style="padding: 12px; border-radius: 12px; border: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; background: #FAFBFC;">
                                        <div>
                                            <div style="font-size: 12px; font-weight: 700; color: #0F172A;">${m.nombre}</div>
                                            <div style="font-size: 10px; color: #94A3B8;">ID: ${m.cedula}</div>
                                        </div>
                                        <button onclick="navigateToConsulta('${m.cedula}')" style="background: white; border: 1px solid #E2E8F0; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; color: #64748B;">→</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>


                        <div class="matrix-card" style="padding: 24px; margin-bottom: 0;">
                             <div class="flex justify-between align-center mb-6">
                                <h3 style="font-size: 14px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin: 0;">⚠️ Traslapes</h3>
                                <span class="badge" style="background: #FFFBEB; color: #D97706; border: 1px solid #FEF3C7;">${overlap_alerts.length} casos</span>
                            </div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; max-height: 250px; overflow-y: auto;">
                                ${overlap_alerts.length === 0 ? '<p style="color: #94A3B8; font-size: 13px;">No hay traslapes.</p>' : overlap_alerts.map(m => `
                                    <div style="padding: 12px; border-radius: 12px; border: 1px solid #F1F5F9; display: flex; justify-content: space-between; align-items: center; background: #FFFDF5;">
                                        <div>
                                            <div style="font-size: 12px; font-weight: 700; color: #0F172A;">${m.nombre}</div>
                                            <div style="font-size: 10px; color: #94A3B8;">ID: ${m.cedula}</div>
                                        </div>
                                        <button onclick="navigateToConsulta('${m.cedula}')" style="background: white; border: 1px solid #E2E8F0; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; color: #64748B;">→</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            this.renderBarChart('chart-planta', dist_planta, (d) => `${d.financiado} / ${d.total}`);
            this.renderBarChart('chart-dir-personas', dist_direccion, (d) => `${d.financiado} / ${d.total}`);
            this.renderBarChart('chart-dir-costo', dist_direccion_costo, (d) => ui.moneyCompact(d.value));

            // Bind Events
            document.getElementById('dashboard-year-select').onchange = (e) => {
                this.selectedYear = parseInt(e.target.value);
                this.render();
            };
            document.getElementById('btn-master-report').onclick = () => {
                reporte.render(this.selectedYear);
            };

        } catch (err) {
            console.error(err);
            container.innerHTML = `<div class="luxury-card" style="text-align: center; color: var(--danger);"><p>Error al cargar el dashboard: ${err.message}</p></div>`;
        }
    },

    kpiModern(title, value, icon, color) {
        return `
            <div class="kpi-modern">
                <div style="width: 56px; height: 56px; border-radius: 16px; background: ${color}10; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                    ${icon}
                </div>
                <div>
                    <div style="font-size: 12px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">${title}</div>
                    <div style="font-size: 24px; font-weight: 800; color: #0F172A; letter-spacing: -0.02em;">${value}</div>
                </div>
            </div>
        `;
    },

    chartCard(title, chartId, subtitle) {
        return `
            <div class="matrix-card" style="padding: 24px; margin: 0;">
                <h4 style="font-size: 13px; font-weight: 800; color: #0F172A; text-transform: uppercase; margin-bottom: 4px;">${title}</h4>
                <p style="font-size: 11px; color: #94A3B8; margin-bottom: 20px;">${subtitle}</p>
                <div id="${chartId}" style="min-height: 180px;"></div>
            </div>
        `;
    },

    renderBarChart(containerId, data, labelFn) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";
        const maxVal = Math.max(...data.map(d => d.total || d.value || 0));

        data.forEach(item => {
            const val = item.total || item.value || 0;
            const pct = maxVal > 0 ? (val / maxVal * 100) : 0;
            container.innerHTML += `
                <div class="mb-4">
                    <div class="flex justify-between mb-1" style="font-size: 11px; font-weight: 700;">
                        <span style="color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%;">${item.label}</span>
                        <span style="color: #94A3B8;">${labelFn(item)}</span>
                    </div>
                    <div style="height: 6px; background: #F1F5F9; border-radius: 10px; overflow: hidden;">
                        <div style="height: 100%; width: ${pct}%; background: var(--chart-1, #0F172A); border-radius: 10px;"></div>
                    </div>
                </div>
            `;
        });
    },

    kpiCard() { /* Deprecated in favor of kpiModern */ },
    renderUserWelcome(container) {
        container.innerHTML = `
            <div style="padding: 100px 40px; text-align: center; max-width: 800px; margin: 0 auto;">
                <div style="font-size: 80px; margin-bottom: 32px; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.1));">✨</div>
                <h1 style="font-family: 'Outfit'; font-size: 48px; font-weight: 800; color: #0F172A; letter-spacing: -0.04em; margin-bottom: 16px;">
                    ¡Hola de nuevo, ${auth._user.nombre.split(' ')[0]}!
                </h1>
                <p style="font-family: 'Outfit'; font-size: 18px; color: #64748B; line-height: 1.6; margin-bottom: 40px;">
                    Tu panel de control personal está listo. Consulta el estado de tu liquidación 
                    y planeación con un solo clic.
                </p>
                <button onclick="window.location.hash='#/consulta'" class="btn-consultar" style="height: 56px; padding: 0 40px; font-size: 16px; border-radius: 16px;">
                    Ir a consulta detallada →
                </button>
            </div>
        `;
    },

    async renderFlujoCaja() {
        try {
            document.getElementById('loader').classList.remove('hidden');
            const data = await api.get(`/admin/flujo-caja?anio=${this.selectedYear}`);
            document.getElementById('loader').classList.add('hidden');

            if (!data.ok) throw new Error("Error cargando flujo de caja");

            const rows = data.data; // Assuming data structure based on admin.py

            let html = `
                <div style="padding: 24px;">
                    <h3 style="margin-bottom: 24px;">Flujo de Caja - Detalle de Proyectos</h3>
                    <table class="matrix-table" style="width: 100%;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Proyecto</th>
                                <th style="text-align: left;">Centro</th>
                                <th style="text-align: right;">Enero</th>
                                <th style="text-align: right;">Febrero</th>
                                <th style="text-align: right;">Marzo</th>
                                <th style="text-align: right;">Total Q1</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                                <tr>
                                    <td>${r.nombre_proyecto || 'N/A'}</td>
                                    <td>${r.gerencia || 'General'}</td>
                                    <td class="text-right matrix-money">${ui.moneyCompact(r.months[0])}</td>
                                    <td class="text-right matrix-money">${ui.moneyCompact(r.months[1])}</td>
                                    <td class="text-right matrix-money">${ui.moneyCompact(r.months[2])}</td>
                                    <td class="text-right matrix-money" style="font-weight: 700;">${ui.moneyCompact(r.months[0] + r.months[1] + r.months[2])}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;

            ui.showModal("Flujo de Caja (Vista Rápida)", html);

        } catch (e) {
            console.error(e);
            alert("Error cargando Flujo de Caja: " + e.message);
            document.getElementById('loader').classList.add('hidden');
        }
    },

    async downloadGlobalExcel() {
        try {
            document.getElementById('loader').classList.remove('hidden');
            const response = await api.get(`/admin/reporte-detallado?anio=${this.selectedYear}`);
            document.getElementById('loader').classList.add('hidden');

            if (!response.ok) throw new Error("Falló descarga de datos");

            const data = response.data;
            if (!data || data.length === 0) {
                alert("No hay datos para exportar");
                return;
            }

            // CSV Generation
            const headers = ["Cedula", "Nombre", "Proyecto", "Rubro", "Contrato", "Inicio", "Fin", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            let csvContent = headers.join(",") + "\n";

            data.forEach(row => {
                const values = [
                    row.cedula,
                    `"${row.nombre}"`,
                    `"${row.nombre_proyecto || ''}"`,
                    `"${row.rubro || ''}"`,
                    row.id_contrato,
                    row.fecha_inicio,
                    row.fecha_fin,
                    // Months (handle dict or array)
                    ...(Array.isArray(row.months) ? row.months : Object.values(row.meses || {}))
                ];
                csvContent += values.join(",") + "\n";
            });

            // Trigger Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Reporte_Global_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (e) {
            console.error(e);
            alert("Error exportando: " + e.message);
            document.getElementById('loader').classList.add('hidden');
        }
    }
};
