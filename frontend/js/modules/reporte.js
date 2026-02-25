import { ui } from '../ui.js';
import { api } from './api.js';

export const reporte = {
    _data: [],
    _filteredData: [],

    async render(anio = null) {
        this._currentYear = anio || new Date().getFullYear();
        // Create Overlay
        const overlayId = 'reporte-overlay';
        let overlay = document.getElementById(overlayId);
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(243, 244, 246, 0.98); z-index: 2000;
            overflow-y: auto; padding: 20px;
            display: flex; flex-direction: column; align-items: center;
        `;

        // Modal Container
        const container = document.createElement('div');
        container.className = 'luxury-card';
        container.style.cssText = `
            width: 100%; max-width: 1400px; height: 95vh; display: flex; flex-direction: column;
            padding: 0; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        `;

        // HEADER
        overlay.innerHTML = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
                
                #reporte-detailed-container * { font-family: 'Outfit', sans-serif; }
                
                .report-header {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                    padding: 24px 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    position: sticky;
                    top: 0;
                    z-index: 100;
                }

                .filter-bar {
                    background: #FFFFFF;
                    padding: 24px 40px;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 20px;
                    border-bottom: 1px solid rgba(0,0,0,0.05);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.02);
                }

                .filter-group label {
                    font-size: 10px;
                    font-weight: 800;
                    color: #94A3B8;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 8px;
                    display: block;
                }

                .report-table-wrapper {
                    flex: 1;
                    overflow: auto;
                    background: #FDFDFD;
                    padding: 0;
                }

                .modern-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }

                .modern-table th {
                    background: #F8FAFC;
                    padding: 16px 12px;
                    font-size: 10px;
                    font-weight: 800;
                    color: #64748B;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid #E2E8F0;
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                    z-index: 20;
                }

                .modern-table th.frozen, .modern-table td.frozen {
                    position: sticky;
                    left: 0;
                    z-index: 30;
                    background: inherit;
                    border-right: 1px solid #E2E8F0;
                }

                .colab-row {
                    background: white;
                    transition: all 0.2s;
                }

                .colab-row:hover, .colab-row:hover td.frozen {
                    background: #F8FAFC !important;
                }

                .project-row {
                    background: #FFFFFF;
                    font-size: 10px;
                }

                .project-row:hover, .project-row:hover td.frozen {
                    background: #F8FAFC !important;
                }

                .project-row td {
                    color: #64748B;
                    border-bottom: 1px solid #F1F5F9;
                }

                .money-cell {
                    font-family: 'JetBrains Mono', monospace;
                    letter-spacing: -0.02em;
                }
                
                .total-column-cell {
                    background: #F0F7FF !important;
                    color: #1E40AF !important; /* Deeper blue for better contrast */
                    font-weight: 800;
                }

                /* Custom Multi-select tweaks */
                .ms-button {
                    border: 1px solid #E2E8F0 !important;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
                    transition: border-color 0.2s;
                    border-radius: 10px !important;
                }
                .ms-button:hover { border-color: #94A3B8 !important; }

                .btn-consultar {
                    background: #0F172A;
                    color: white;
                    border-radius: 10px;
                    padding: 0 24px;
                    font-weight: 600;
                    font-size: 13px;
                    height: 42px;
                    border: none;
                    cursor: pointer;
                    transition: transform 0.1s;
                }
                .btn-consultar:active { transform: scale(0.98); }
            </style>

            <div id="reporte-detailed-container" style="display: flex; flex-direction: column; width: 100%; height: 100%;">
                <div class="report-header">
                    <div>
                        <h2 style="margin: 0; font-size: 24px; font-weight: 800; color: #0F172A; letter-spacing: -0.03em;">
                            Intelligence Report 
                            <span style="font-weight: 300; color: #94A3B8; font-size: 18px;">/ Nómina Mensualizada ${this._currentYear}</span>
                        </h2>
                        <p style="margin: 4px 0 0 0; color: #64748B; font-size: 12px; font-weight: 400;">Visualización consolidada de carga salarial por trabajador y proyectos para la vigencia ${this._currentYear}.</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="btn-export-cars" class="btn btn-ghost" style="color: #0F172A; font-weight: 700; font-size: 13px; border: 1px solid #E2E8F0; border-radius: 8px;">
                            📋 Exportar detalle para CARs
                        </button>
                        <button id="close-reporte" class="btn btn-ghost" style="color: #EF4444; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                            <span>✕</span> Cerrar Reporte
                        </button>
                    </div>
                </div>

                <div class="filter-bar">
                    <div class="filter-group">
                        <label>Periodo (Meses)</label>
                        <div id="rep-mes" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group">
                        <label>Dirección</label>
                        <div id="rep-direccion" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group">
                        <label>Gerencia</label>
                        <div id="rep-gerencia" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group">
                        <label>Proyecto</label>
                        <div id="rep-proyecto" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group">
                        <label>Planta</label>
                        <div id="rep-planta" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group">
                        <label>Tipo Planta</label>
                        <div id="rep-tipo-planta" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group">
                        <label>Base Fuente</label>
                        <div id="rep-base-fuente" class="multi-select-custom"></div>
                    </div>
                    <div class="filter-group" style="grid-column: span 1;">
                        <label>Búsqueda Inteligente</label>
                        <div class="flex gap-2">
                            <input type="text" id="rep-search" placeholder="Nombre o Cédula..." 
                                style="width: 100%; padding: 0 16px; border-radius: 10px; border: 1px solid #E2E8F0; font-size: 13px; height: 42px; outline: none;">
                            <button id="rep-btn-filter" class="btn-consultar">Filtrar</button>
                        </div>
                    </div>
                </div>

                <div style="padding: 12px 40px; background: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.03);">
                    <div style="font-size: 12px; color: #64748B;">
                        Mostrando <strong id="rep-count" style="color: #0F172A;">0</strong> trabajadores únicos
                    </div>
                    <div id="report-timestamp" style="font-size: 10px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.1em;">
                        Generado: ${new Date().toLocaleDateString()}
                    </div>
                </div>

                <div class="report-table-wrapper" id="rep-table-container">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // --- Event Listeners ---
        document.getElementById('close-reporte').onclick = () => overlay.remove();
        document.getElementById('rep-btn-filter').onclick = () => this.applyFilters();
        document.getElementById('rep-search').oninput = () => this.applyFilters();
        document.getElementById('btn-export-cars').onclick = () => this.exportCars();

        // Fetch Data
        await this.fetchData();
    },

    async exportCars() {
        try {
            const btn = document.getElementById('btn-export-cars');
            const originalText = btn.innerText;
            btn.innerText = "⏳ Generando...";
            btn.disabled = true;

            const json = await api.get(`/admin/reporte-cars?anio=${this._currentYear}`);

            if (json.ok) {
                const ws = XLSX.utils.json_to_sheet(json.data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Detalle CARs");
                XLSX.writeFile(wb, `Reporte_CARS_${new Date().toISOString().slice(0, 10)}.xlsx`);
                ui.showToast("Reporte descargado exitosamente");
            } else {
                alert("Error generando reporte");
            }

            btn.innerText = originalText;
            btn.disabled = false;
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
            document.getElementById('btn-export-cars').innerText = "📋 Exportar detalle CARs";
            document.getElementById('btn-export-cars').disabled = false;
        }
    },

    async fetchData() {
        try {
            document.getElementById('rep-table-container').innerHTML = '<div class="loading-spinner"></div>';
            const json = await api.get(`/admin/reporte-detallado?anio=${this._currentYear}`);
            if (json.ok) {
                // Normalization
                this._data = json.data.map(d => {
                    if ((!d.meses || Object.keys(d.meses).length === 0) && Array.isArray(d.months)) {
                        d.meses = {};
                        d.months.forEach((val, idx) => {
                            d.meses[idx + 1] = val;
                        });
                    }
                    if (!d.gerencia || d.gerencia.trim() === '') {
                        d.gerencia = 'Grupo de Trabajo';
                    } else if (d.gerencia.startsWith('Gerencia de Centro')) {
                        d.gerencia = d.gerencia.replace('Gerencia de Centro', 'Centro');
                    }
                    return d;
                });

                this.populateFilters();
                this.applyFilters();
            } else {
                alert('Error al cargar reporte');
            }
        } catch (e) {
            console.error(e);
            document.getElementById('rep-table-container').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Error de conexión con el servidor.</div>';
        }
    },

    populateFilters() {
        // Months
        const monthOpts = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => ({ value: i + 1, label: m }));
        this.renderMultiSelect('rep-mes', monthOpts, "Seleccionar Meses");

        const dirs = new Set();
        const plantas = new Set();
        const tipos = new Set();
        const bases = new Set();

        this._data.forEach(d => {
            if (d.direccion) dirs.add(d.direccion);
            if (d.planta) plantas.add(d.planta);
            if (d.tipo_planta) tipos.add(d.tipo_planta);
            if (d.base_fuente) bases.add(d.base_fuente);
        });

        this.renderMultiSelect('rep-direccion', [...dirs].sort(), "Seleccionar Direcciones");
        this.renderMultiSelect('rep-planta', [...plantas].sort(), "Seleccionar Planta");
        this.renderMultiSelect('rep-tipo-planta', [...tipos].sort(), "Tipo Planta");
        this.renderMultiSelect('rep-base-fuente', [...bases].sort(), "Base Fuente");

        this.updateLinkedFilters('dir');
    },

    renderMultiSelect(id, options, placeholder) {
        const container = document.getElementById(id);
        if (!container) return;

        container.innerHTML = ui.renderSearchableMultiSelect(id + '-inner', null, options, placeholder);
        ui.initSearchableMultiSelect(id + '-inner', () => {
            const cascades = {
                'rep-direccion': 'dir',
                'rep-gerencia': 'ger',
                'rep-planta': 'pla',
                'rep-tipo-planta': 'tip',
                'rep-base-fuente': 'bas'
            };
            if (cascades[id]) this.updateLinkedFilters(cascades[id]);
            else this.applyFilters();
        }, placeholder);
    },

    getSelectedValues(id) {
        const container = document.getElementById(`options-${id}-inner`);
        if (!container) return [];
        return [...container.querySelectorAll('.ms-check:checked')].map(c => c.value);
    },

    updateLinkedFilters(source) {
        const selDirs = this.getSelectedValues('rep-direccion');
        const selGers = this.getSelectedValues('rep-gerencia');
        const selPlantas = this.getSelectedValues('rep-planta');
        const selTipos = this.getSelectedValues('rep-tipo-planta');
        const selBases = this.getSelectedValues('rep-base-fuente');

        // Cascade Hierarchy: Dir -> Ger -> Planta -> Tipo -> Base -> Proyecto

        // 1. Update Gerencias based on selection of Dirs
        if (source === 'dir') {
            const gers = new Set();
            this._data.filter(d => selDirs.length === 0 || selDirs.includes(d.direccion))
                .forEach(d => { if (d.gerencia) gers.add(d.gerencia); });
            this.renderMultiSelect('rep-gerencia', [...gers].sort(), "Seleccionar Gerencias");
        }

        // 2. Update Plantas based on Dirs + Gers
        if (['dir', 'ger'].includes(source)) {
            const plantas = new Set();
            this._data.filter(d =>
                (selDirs.length === 0 || selDirs.includes(d.direccion)) &&
                (selGers.length === 0 || selGers.includes(d.gerencia))
            ).forEach(d => { if (d.planta) plantas.add(d.planta); });
            this.renderMultiSelect('rep-planta', [...plantas].sort(), "Seleccionar Planta");
        }

        // 3. Update Tipos based on Dirs + Gers + Plantas
        if (['dir', 'ger', 'pla'].includes(source)) {
            const tipos = new Set();
            this._data.filter(d =>
                (selDirs.length === 0 || selDirs.includes(d.direccion)) &&
                (selGers.length === 0 || selGers.includes(d.gerencia)) &&
                (selPlantas.length === 0 || selPlantas.includes(d.planta))
            ).forEach(d => { if (d.tipo_planta) tipos.add(d.tipo_planta); });
            this.renderMultiSelect('rep-tipo-planta', [...tipos].sort(), "Tipo Planta");
        }

        // 4. Update Bases based on Dirs + Gers + Plantas + Tipos
        if (['dir', 'ger', 'pla', 'tip'].includes(source)) {
            const bases = new Set();
            this._data.filter(d =>
                (selDirs.length === 0 || selDirs.includes(d.direccion)) &&
                (selGers.length === 0 || selGers.includes(d.gerencia)) &&
                (selPlantas.length === 0 || selPlantas.includes(d.planta)) &&
                (selTipos.length === 0 || selTipos.includes(d.tipo_planta))
            ).forEach(d => { if (d.base_fuente) bases.add(d.base_fuente); });
            this.renderMultiSelect('rep-base-fuente', [...bases].sort(), "Base Fuente");
        }

        // 5. Update Proyectos based on ALL above
        const proys = new Set();
        this._data.filter(d =>
            (selDirs.length === 0 || selDirs.includes(d.direccion)) &&
            (selGers.length === 0 || selGers.includes(d.gerencia)) &&
            (selPlantas.length === 0 || selPlantas.includes(d.planta)) &&
            (selTipos.length === 0 || selTipos.includes(d.tipo_planta)) &&
            (selBases.length === 0 || selBases.includes(d.base_fuente))
        ).forEach(d => {
            if (d.proyectos) d.proyectos.forEach(p => proys.add(p));
            if (d.nombre_proyecto) proys.add(d.nombre_proyecto);
        });
        this.renderMultiSelect('rep-proyecto', [...proys].sort(), "Seleccionar Proyectos");

        // Auto-filter after updating linked lists
        this.applyFilters();
    },

    applyFilters() {
        const selMonths = this.getSelectedValues('rep-mes');
        const selDirs = this.getSelectedValues('rep-direccion');
        const selGers = this.getSelectedValues('rep-gerencia');
        const selProys = this.getSelectedValues('rep-proyecto');
        const selPlantas = this.getSelectedValues('rep-planta');
        const selTipos = this.getSelectedValues('rep-tipo-planta');
        const selBases = this.getSelectedValues('rep-base-fuente');
        const fSearch = document.getElementById('rep-search').value.toLowerCase();

        this._filteredData = this._data.filter(d => {
            if (selDirs.length > 0 && !selDirs.includes(d.direccion)) return false;
            if (selGers.length > 0 && !selGers.includes(d.gerencia)) return false;
            if (selPlantas.length > 0 && !selPlantas.includes(d.planta)) return false;
            if (selTipos.length > 0 && !selTipos.includes(d.tipo_planta)) return false;
            if (selBases.length > 0 && !selBases.includes(d.base_fuente)) return false;
            if (selProys.length > 0) {
                const hasProy = d.proyectos ? d.proyectos.some(p => selProys.includes(p)) : selProys.includes(d.nombre_proyecto);
                if (!hasProy) return false;
            }
            if (fSearch && !d.nombre.toLowerCase().includes(fSearch) && !String(d.cedula).includes(fSearch)) return false;
            return true;
        });

        const uniqueCedulas = new Set(this._filteredData.map(d => d.cedula));
        document.getElementById('rep-count').textContent = uniqueCedulas.size;
        this.renderTable(selMonths);
    },

    renderTable(selectedMonths = []) {
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const mIndices = selectedMonths.length > 0 ? selectedMonths.map(m => parseInt(m)) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const isPeriodNarrow = selectedMonths.length > 0 && selectedMonths.length < 12;

        const grouped = {};
        this._filteredData.forEach(d => {
            if (!grouped[d.cedula]) {
                grouped[d.cedula] = { cedula: d.cedula, nombre: d.nombre, proyectos: [] };
            }
            grouped[d.cedula].proyectos.push(d);
        });

        const collaborators = Object.values(grouped).sort((a, b) => a.nombre.localeCompare(b.nombre));

        let html = `
            <table class="modern-table">
                <thead>
                    <tr>
                        <th class="frozen">Trabajador / Proyectos</th>
                        ${mIndices.map(i => `<th style="text-align: right;">${months[i - 1]}</th>`).join('')}
                        ${!isPeriodNarrow ? `<th style="text-align: right; color: #0F172A;">Consolidado</th>` : ''}
                    </tr>
                </thead>
                <tbody>
        `;

        const colTotals = {};
        mIndices.forEach(i => colTotals[i] = 0);
        let grandTotal = 0;

        collaborators.forEach(c => {
            const cMonthTotals = {};
            mIndices.forEach(i => cMonthTotals[i] = 0);
            let cGrandTotal = 0;

            c.proyectos.forEach(p => {
                mIndices.forEach(i => {
                    const val = (p.meses && p.meses[i]) || 0;
                    cMonthTotals[i] += val;
                    colTotals[i] += val;
                });
            });

            mIndices.forEach(i => cGrandTotal += cMonthTotals[i]);
            grandTotal += cGrandTotal;

            if (cGrandTotal === 0 && selectedMonths.length > 0) return;

            html += `
                <tr class="colab-row">
                    <td class="frozen" style="padding: 16px 40px 16px 24px;">
                        <div style="font-weight: 800; font-size: 13px; color: #0F172A; margin-bottom: 2px;">${c.nombre}</div>
                        <div style="font-size: 10px; color: #94A3B8; font-weight: 600;">ID: ${c.cedula}</div>
                    </td>
                    ${mIndices.map(i => `
                        <td class="money-cell" style="text-align: right; font-weight: 800; font-size: 11px; color: #0F172A; padding: 16px 12px;">
                            ${cMonthTotals[i] > 0 ? ui.money(cMonthTotals[i]) : '<span style="color: #E2E8F0;">—</span>'}
                        </td>
                    `).join('')}
                    ${!isPeriodNarrow ? `
                        <td class="money-cell total-column-cell" style="text-align: right; font-size: 11px; padding: 16px 12px;">
                            ${ui.money(cGrandTotal)}
                        </td>
                    ` : ''}
                </tr>
            `;

            c.proyectos.forEach(p => {
                const pTotal = mIndices.reduce((acc, i) => acc + ((p.meses && p.meses[i]) || 0), 0);
                html += `
                    <tr class="project-row">
                        <td class="frozen" style="padding: 12px 40px 12px 48px; border-left: 3px solid #E2E8F0;">
                            <div style="font-weight: 600; color: #64748B;">${p.nombre_proyecto || p.id_proyecto || 'Sin Proyecto'}</div>
                        </td>
                        ${mIndices.map(i => `
                            <td class="money-cell" style="text-align: right; font-size: 10px; padding: 10px 12px;">
                                ${p.meses && p.meses[i] ? ui.money(p.meses[i]) : '<span style="color: #F1F5F9;">—</span>'}
                            </td>
                        `).join('')}
                        ${!isPeriodNarrow ? `<td class="money-cell total-column-cell" style="text-align: right; font-size: 10px; padding: 10px 12px;">${ui.money(pTotal)}</td>` : ''}
                    </tr>
                `;
            });
        });

        html += `
            <tr style="position: sticky; bottom: 0; background: #0F172A; color: white !important; z-index: 50;">
                <td class="frozen" style="padding: 24px 24px; font-weight: 800; font-size: 12px; background: #0F172A; color: white !important; border-top: 1px solid rgba(255,255,255,0.1);">TOTAL CONSOLIDADO</td>
                ${mIndices.map(i => `
                    <td class="money-cell" style="padding: 24px 12px; text-align: right; font-size: 12px; font-weight: 800; border-top: 1px solid rgba(255,255,255,0.1); color: #F8FAFC !important;">
                        ${ui.money(colTotals[i])}
                    </td>
                `).join('')}
                ${!isPeriodNarrow ? `
                    <td class="money-cell" style="padding: 24px 12px; text-align: right; color: #7DD3FC !important; font-size: 14px; font-weight: 900; border-top: 2px solid #38BDF8; background: rgba(56, 189, 248, 0.05);">
                        ${ui.money(grandTotal)}
                    </td>
                ` : ''}
            </tr>
         `;

        html += `</tbody></table>`;
        document.getElementById('rep-table-container').innerHTML = html;
    }
};
