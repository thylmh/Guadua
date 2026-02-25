
import { api } from './api.js';
import { ui } from '../ui.js';

export const financiero = {
    _rawData: [],
    _currentMonthData: [],

    async render() {
        const container = document.getElementById('financiero-view');
        container.innerHTML = `
            <div class="dashboard-content">
                <!-- Header Component -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
                    <div>
                        <h1 style="font-size: 24px; font-weight: 800; color: var(--primary-dark); letter-spacing: -0.02em; margin: 0;">Análisis Financiero</h1>
                        <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">Control de ejecución presupuestal y flujo de caja.</p>
                    </div>
                     <button onclick="window.financiero.downloadExcel()" class="btn btn-primary">
                        <span>⬇</span> Exportar Detalle
                    </button>
                </div>

                <!-- Modern Tabs (Segmented Control) -->
                <div style="display: flex; justify-content: center; margin-bottom: 24px;">
                    <div style="background: #F1F5F9; padding: 4px; border-radius: 12px; display: inline-flex; gap: 4px;">
                        <button id="tab-devengado" class="segment-btn active" onclick="window.financiero.switchTab('devengado')" 
                            style="padding: 10px 32px; border-radius: 8px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s;">
                            Devengado (Costos)
                        </button>
                        <button id="tab-flujo" class="segment-btn" onclick="window.financiero.switchTab('flujo')" 
                            style="padding: 10px 32px; border-radius: 8px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; transition: all 0.2s; color: var(--text-muted);">
                            Flujo de Caja
                        </button>
                    </div>
                </div>

                <div class="luxury-card" style="min-height: 600px; padding: 0;">
                    <!-- Content -->
                    <div id="fin-content">
                        <div class="loading-spinner" style="margin: 40px auto;"></div>
                    </div>
                </div>
            </div>

            <style>
                .segment-btn.active {
                    background: white;
                    color: var(--primary-dark) !important;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
                }
                .segment-btn:not(.active):hover {
                    color: var(--text);
                }
            </style>
        `;

        await this.loadDevengado();
    },

    switchTab(tab) {
        document.querySelectorAll('.segment-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = 'var(--text-muted)';
            b.style.boxShadow = 'none';
        });

        const activeBtn = document.getElementById(`tab-${tab}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.style.background = 'white';
            activeBtn.style.color = 'var(--primary-dark)';
            activeBtn.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)';
        }

        const content = document.getElementById('fin-content');
        content.innerHTML = '<div style="padding: 40px; text-align: center;"><div class="loading-spinner"></div></div>';

        if (tab === 'devengado') this.loadDevengado();
        else this.loadFlujoCaja();
    },

    async loadDevengado() {
        try {
            const res = await api.get('/admin/mensualizado-global');
            if (!res.ok) throw new Error("Error cargando datos");
            this._rawData = res.data;

            const months = {};
            let totalYear = 0;

            this._rawData.forEach(m => {
                const monthKey = m.anioMes;
                // Fix: Parse local date properly
                const [y, mo, d] = m.anioMes.split('-');
                const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
                const monthName = date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });

                const mTotal = m.detalle.reduce((acc, d) => acc + d.valor, 0);
                months[monthKey] = {
                    key: monthKey,
                    name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                    total: mTotal,
                    count: new Set(m.detalle.map(d => d.cedula)).size
                };
                totalYear += mTotal;
            });

            const sortedKeys = Object.keys(months).sort();

            let html = `
                <div style="padding: 32px;">
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--text);">Distribución ponderada por vigencia</h3>
                        <p style="font-size: 13px; color: var(--text-muted);">Distribución ponderada por vigencia.</p>
                    </div>

                    <div class="table-wrap">
                        <table style="width: 100%;">
                            <thead>
                                <tr>
                                    <th>Periodo</th>
                                    <th style="text-align: right;">Trabajadores unicos</th>
                                    <th style="text-align: right;">Impacto Financiero</th>
                                    <th style="width: 25%;">Participación</th>
                                    <th style="text-align: right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            sortedKeys.forEach(k => {
                const m = months[k];
                const pct = totalYear > 0 ? (m.total / totalYear * 100) : 0;

                html += `
                    <tr>
                        <td style="font-weight: 700; color: var(--primary-dark); font-size: 14px;">${m.name}</td>
                        <td style="text-align: right; color: var(--text-muted); font-size: 13px;">${m.count}</td>
                        <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--text);">
                            ${ui.money(m.total)}
                        </td>
                        <td style="padding: 16px 24px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="flex: 1; height: 6px; background: #F3F4F6; border-radius: 3px; overflow: hidden;">
                                    <div style="height: 100%; width: ${pct}%; background: var(--primary); border-radius: 3px;"></div>
                                </div>
                                <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); width: 32px;">${pct.toFixed(1)}%</span>
                            </div>
                        </td>
                        <td style="text-align: right;">
                            <button class="btn btn-sm btn-ghost" onclick="window.financiero.openMonthDetail('${m.key}', '${m.name}')" style="border: 1px solid var(--border);">
                                Ver Detalle
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `</tbody></table></div></div>`;
            document.getElementById('fin-content').innerHTML = html;

        } catch (e) {
            console.error(e);
            document.getElementById('fin-content').innerHTML = `<p style="padding: 32px; color: var(--accent-warm);">Error cargando datos: ${e.message}</p>`;
        }
    },

    openMonthDetail(monthKey, monthName) {
        const mData = this._rawData.find(m => m.anioMes === monthKey);
        if (!mData) return;

        this._currentMonthData = mData.detalle;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'fin-modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content" style="max-width: 1000px; height: 85vh; padding: 0; display: flex; flex-direction: column;">
                
                <!-- Modal Header -->
                <div style="padding: 24px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--white);">
                    <div>
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Detalle Mensual</div>
                        <h2 style="font-size: 20px; font-weight: 800; color: var(--primary-dark); margin: 0;">📅 ${monthName}</h2>
                    </div>
                    <button class="btn btn-sm btn-ghost" id="close-fin-modal">✕ Cerrar</button>
                </div>
                
                <!-- Search Bar -->
                <div style="padding: 16px 24px; background: #F9FAFB; border-bottom: 1px solid var(--border);">
                    <input type="text" id="fin-search" placeholder="🔍 Buscar por proyecto, componente o persona..." 
                        style="background: white; border: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                </div>

                <!-- Scrollable Body -->
                <div id="fin-modal-body" style="flex: 1; overflow-y: auto;">
                    <!-- Table content goes here -->
                </div>
                
                <!-- Footer -->
                <div style="padding: 20px 24px; background: #F9FAFB; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: var(--text-muted); font-size: 12px; text-transform: uppercase;">Total Global Mes</span>
                    <span style="font-family: 'JetBrains Mono'; font-weight: 800; color: var(--primary-dark); font-size: 16px;">
                        ${ui.money(mData.detalle.reduce((a, b) => a + b.valor, 0))}
                    </span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('close-fin-modal').onclick = () => overlay.remove();
        document.getElementById('fin-search').onkeyup = (e) => this.renderMonthDetailTable(e.target.value);

        this.renderMonthDetailTable();
    },

    renderMonthDetailTable(searchTxt = '') {
        const container = document.getElementById('fin-modal-body');
        const txt = searchTxt.toLowerCase();

        const grouped = {};
        this._currentMonthData.forEach(d => {
            const pName = d.nombre_proyecto || d.id_proyecto || 'Sin Proyecto';
            const cName = d.componente || 'General';
            // Search filter including embedded items
            if (txt && !pName.toLowerCase().includes(txt) && !cName.toLowerCase().includes(txt) && !d.nombre.toLowerCase().includes(txt)) return;

            const pid = d.id_proyecto || 'UNK';
            if (!grouped[pid]) {
                grouped[pid] = { id: pid, name: pName, items: [], total: 0 };
            }
            grouped[pid].items.push(d);
            grouped[pid].total += d.valor;
        });

        const projects = Object.values(grouped).sort((a, b) => b.total - a.total);

        if (projects.length === 0) {
            container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">No se encontraron resultados.</div>`;
            return;
        }

        let html = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="padding-left: 24px;">Proyecto</th>
                        <th style="text-align: right;">Total Mes</th>
                        <th style="text-align: center;">Personas</th>
                        <th style="width: 50px;"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        projects.forEach(p => {
            html += `
                <tr onclick="window.financiero.toggleProject('${p.id}')" style="cursor: pointer; border-bottom: 1px solid var(--border);">
                    <td style="padding: 16px 24px;">
                        <div style="font-weight: 700; color: var(--text); font-size: 13px;">${p.name.replace('Proyecto ', '')} | ${p.items[0].fuente || 'Funcionamiento 2026'}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">Componente: ${p.items[0].componente || 'General'}</div>
                    </td>
                    <td style="text-align: right; font-family: 'JetBrains Mono'; font-weight: 700; color: var(--primary-dark);">
                        ${ui.money(p.total)}
                    </td>
                    <td style="text-align: center; color: var(--text-muted); font-size: 12px;">
                        ${new Set(p.items.map(i => i.cedula)).size}
                    </td>
                    <td style="text-align: center; color: var(--text-muted);">
                        <span id="icon-${p.id}" style="transition: transform 0.2s; display: inline-block;">▶</span>
                    </td>
                </tr>
                <tr id="detail-${p.id}" class="hidden" style="background: #F9FAFB;">
                    <td colspan="4" style="padding: 0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.03);">
                        <div style="padding: 12px 24px;">
                            ${this.renderInnerDetails(p.items)}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;
    },

    renderInnerDetails(items) {
        items.sort((a, b) => a.nombre.localeCompare(b.nombre));

        return `
            <table style="width: 100%; font-size: 12px;">
                <thead>
                    <tr>
                        <th style="background: transparent; border-bottom: 1px solid var(--border); color: var(--text-muted); padding: 8px 0;">Trabajador / Componente</th>
                        <th style="background: transparent; border-bottom: 1px solid var(--border); color: var(--text-muted); padding: 8px 0; text-align: right;">Rubro</th>
                        <th style="background: transparent; border-bottom: 1px solid var(--border); color: var(--text-muted); padding: 8px 0; text-align: right;">Valor</th>
                    </tr>
                </thead>
                <tbody>
                ${items.map(i => `
                    <tr>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB; color: var(--text);">
                            <div style="font-weight: 600;">${i.nombre}</div>
                            <div style="font-size: 10px; color: var(--primary);">🧩 ${i.componente || 'General'}</div>
                        </td>
                         <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB; text-align: right; color: var(--text-muted);">
                            ${i.rubro || 'N/A'}
                        </td>
                        <td style="padding: 10px 0; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: 'JetBrains Mono'; color: var(--text);">
                            ${ui.money(i.valor)}
                        </td>
                    </tr>
                `).join('')}
                </tbody>
            </table>
        `;
    },

    toggleProject(pid) {
        const row = document.getElementById(`detail-${pid}`);
        const icon = document.getElementById(`icon-${pid}`);
        if (row.classList.contains('hidden')) {
            row.classList.remove('hidden');
            icon.style.transform = 'rotate(90deg)';
        } else {
            row.classList.add('hidden');
            icon.style.transform = 'rotate(0deg)';
        }
    },

    async loadFlujoCaja() {
        try {
            const res = await api.get('/admin/flujo-caja');
            if (!res.ok) throw new Error("Error cargando datos");
            this._rawData = res.data;

            const months = {};
            let totalYear = 0;

            this._rawData.forEach(m => {
                const monthKey = m.anioMes;
                const [y, mo, d] = m.anioMes.split('-');
                const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
                const monthName = date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });

                // Use pre-calculated total or sum detail if available
                const mTotal = m.total !== undefined ? m.total : (m.detalle ? m.detalle.reduce((acc, d) => acc + d.valor, 0) : 0);
                const count = m.detalle ? new Set(m.detalle.map(d => d.cedula)).size : 0;

                months[monthKey] = {
                    key: monthKey,
                    name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                    total: mTotal,
                    count: count,
                    hasDetail: !!m.detalle && m.detalle.length > 0
                };
                totalYear += mTotal;
            });

            const sortedKeys = Object.keys(months).sort();

            let html = `
                <div style="padding: 32px;">
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--text);">Flujo de Caja - Resumen</h3>
                        <p style="font-size: 13px; color: var(--text-muted);">Requerimientos mensuales de efectivo.</p>
                    </div>
                    <div class="table-wrap">
                        <table style="width: 100%;">
                        <thead>
                            <tr>
                                <th>Periodo</th>
                                <th style="text-align: right;">Trabajadores unicos</th>
                                <th style="text-align: right;">Impacto Financiero</th>
                                <th style="width: 25%;">Participación</th>
                                <th style="text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            sortedKeys.forEach(k => {
                const m = months[k];
                const pct = totalYear > 0 ? (m.total / totalYear * 100) : 0;

                html += `
                    <tr>
                         <td style="font-weight: 700; color: var(--primary-dark); font-size: 14px;">${m.name}</td>
                         <td style="text-align: right; color: var(--text-muted); font-size: 13px;">${m.count > 0 ? m.count : '-'}</td>
                         <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--text);">
                            ${ui.money(m.total)}
                         </td>
                         <td style="padding: 16px 24px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="flex: 1; height: 6px; background: #F3F4F6; border-radius: 3px; overflow: hidden;">
                                    <div style="height: 100%; width: ${pct}%; background: var(--primary); border-radius: 3px;"></div>
                                </div>
                                <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); width: 32px;">${pct.toFixed(1)}%</span>
                            </div>
                        </td>
                        <td style="text-align: right;">
                            ${m.hasDetail ? `
                            <button class="btn btn-sm btn-ghost" onclick="window.financiero.openMonthDetail('${m.key}', '${m.name}')" style="border: 1px solid var(--border);">
                                Ver Detalle
                            </button>` : ''}
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table></div></div>`;
            document.getElementById('fin-content').innerHTML = html;
        } catch (e) {
            console.error(e);
            document.getElementById('fin-content').innerHTML = `<p style="padding: 32px; color: var(--accent-warm);">Error cargando datos: ${e.message}</p>`;
        }
    },

    downloadExcel() {
        if (!this._rawData || this._rawData.length === 0) {
            alert("Primero espera a que carguen los datos.");
            return;
        }

        // Prepare data for Excel
        const data = [];
        this._rawData.forEach(m => {
            const am = m.anioMes;
            m.detalle.forEach(d => {
                const c = d.conceptos || {};
                data.push({
                    "AnioMes": am,
                    "Cedula": d.cedula || "",
                    "Nombre": d.nombre || "",
                    "Id_Posicion": d.posicion_c || "",
                    "Cargo": d.cargo || "",
                    "Direccion": d.Direccion || "",
                    "Gerencia": d.gerencia || "",
                    "Contrato": d.contrato || "",
                    "Id_Proyecto": d.id_proyecto || "",
                    "Rubro": d.rubro || "",
                    "Fuente": d.fuente || "",
                    "Componente": d.componente || "",
                    "Subcomponente": d.subcomponente || "",
                    "Categoria": d.categoria || "",
                    "Responsable": d.responsable || "",
                    "Dias": d.dias || 0,
                    "Valor_Total": Math.round(d.valor || 0),
                    "Aux_Transporte": Math.round(c.aux_transporte || 0),
                    "Dotacion": Math.round(c.dotacion || 0),
                    "Primas": Math.round(c.primas || 0),
                    "Sueldo_Vacaciones": Math.round(c.sueldo_vacaciones || 0),
                    "Prima_Vacaciones": Math.round(c.prima_vacaciones || 0),
                    "Cesantias": Math.round(c.cesantias || 0),
                    "Int_Cesantias": Math.round(c.i_cesantias || 0),
                    "Salud": Math.round(c.salud || 0),
                    "Pension": Math.round(c.pension || 0),
                    "ARL": Math.round(c.arl || 0),
                    "CCF": Math.round(c.ccf || 0),
                    "SENA": Math.round(c.sena || 0),
                    "ICBF": Math.round(c.icbf || 0)
                });
            });
        });

        // Use SheetJS to write Excel
        if (typeof XLSX === 'undefined') {
            alert("Error: Librería Excel (SheetJS) no cargada. Contacte soporte.");
            return;
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Detalle Financiero");

        // Simple column width estimation
        const wscols = Object.keys(data[0] || {}).map(() => ({ wch: 15 }));
        ws['!cols'] = wscols;

        XLSX.writeFile(wb, `Reporte_Financiero_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
};
