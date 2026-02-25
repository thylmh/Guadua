
import { api } from './api.js';
import { ui } from '../ui.js';

export const controlPresupuestal = {
    selectedYear: new Date().getFullYear(),
    async load() {
        window.admin_presupuesto = this;
        await this.render();
    },

    async render() {
        const container = document.getElementById('admin-module-container');
        if (!container) return;

        // Estilos
        const styles = `
            <style>
                .cp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
                .cp-card { background: white; border-radius: 16px; border: 1px solid #F1F5F9; padding: 24px; }
                .cp-input { width: 100%; padding: 10px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; margin-top: 4px; outline: none; }
                .cp-btn-primary { background: #0F172A; color: white; padding: 10px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; border: none; }
                .cp-btn-primary:hover { background: #1E293B; }
                
                /* Modal Styles */
                .cp-modal-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px);
                    z-index: 9999; display: flex; justify-content: center; align-items: center;
                    animation: fadeIn 0.2s ease-out;
                }
                .cp-modal-content {
                    background: white; width: 100%; max-width: 500px;
                    border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
                    overflow: hidden; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            </style>
        `;

        const content = await this.getSnapshotsHTML();

        container.innerHTML = styles + `
            <div class="fade-in">
                <div class="cp-header">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 800; color: #1E293B; margin: 0;">Presupuesto: Líneas Base</h2>
                        <p style="color: #64748B; margin-top: 4px; font-size: 14px;">Historial de versiones inmutables</p>
                    </div>
                    <div style="background: white; border: 1px solid #E2E8F0; padding: 6px 16px; border-radius: 12px; display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 10px; font-weight: 800; color: #94A3B8; text-transform: uppercase;">Comparar por Vigencia:</span>
                        <select id="cp-year-select" style="border: none; background: transparent; font-weight: 800; color: #0F172A; outline: none; cursor: pointer;">
                            ${[2024, 2025, 2026, 2027].map(y => `<option value="${y}" ${y === this.selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
                        </select>
                    </div>
                </div>
                ${content}
            </div>
        `;

        this.bindSnapshotEvents();

        document.getElementById('cp-year-select').onchange = (e) => {
            this.selectedYear = parseInt(e.target.value);
            this.render();
        };
    },

    async getSnapshotsHTML() {
        let kpiName = '--', kpiDate = 'No data', rows = '';
        try {
            const res = await api.get('/admin/presupuesto/versiones');
            if (res && res.length > 0) {
                kpiName = res[0].nombre;
                kpiDate = new Date(res[0].fecha).toLocaleString();
                rows = res.map(v => `
                    <tr style="border-bottom: 1px solid #F1F5F9;">
                        <td style="padding: 16px;">#${v.id}</td>
                        <td style="padding: 16px; font-weight: 700;">${v.nombre}</td>
                        <td style="padding: 16px;">${new Date(v.fecha).toLocaleString()}</td>
                        <td style="padding: 16px;">${v.desc || '-'}</td>
                         <td style="padding: 16px; text-align: right;">
                          <td style="padding: 16px; text-align: right; display: flex; gap: 8px; justify-content: flex-end;">
                             <button style="color: #0F172A; background: #F1F5F9; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; border: 1px solid #E2E8F0;" 
                                onclick="window.admin_presupuesto.openComparison(${v.id}, '${v.nombre}')">📊 Comparar Actual</button>
                             <button style="color: #EF4444; background: #FEF2F2; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer; border: 1px solid #FECACA;" 
                                onclick="window.admin_presupuesto.deleteVersion(${v.id})">🗑️ Eliminar</button>
                        </td>
                    </tr>`).join('');
            } else {
                rows = `<tr><td colspan="5" style="padding: 20px; text-align: center;">No hay versiones registradas</td></tr>`;
            }
        } catch (e) { rows = `<tr><td colspan="5" style="color: red; padding: 20px;">Error conexión</td></tr>`; }

        return `
            <div style="display: grid; grid-template-columns: 1fr; gap: 24px;">
                <div class="cp-card" style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 11px; font-weight: 800; color: #94A3B8; text-transform: uppercase;">Última Versión</div>
                        <div style="font-size: 24px; font-weight: 800; color: #0F172A;">${kpiName}</div>
                        <div style="font-size: 12px; color: #64748B;">${kpiDate}</div>
                    </div>
                    <button id="btn-new-snap" class="cp-btn-primary">📸 Congelar Versión Actual</button>
                </div>
                
                <div class="cp-card" style="padding: 0; overflow: hidden;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                            <tr>
                                <th style="padding: 16px; text-align: left; font-size: 11px; color: #64748B; text-transform: uppercase;">ID</th>
                                <th style="padding: 16px; text-align: left; font-size: 11px; color: #64748B; text-transform: uppercase;">Nombre</th>
                                <th style="padding: 16px; text-align: left; font-size: 11px; color: #64748B; text-transform: uppercase;">Fecha</th>
                                <th style="padding: 16px; text-align: left; font-size: 11px; color: #64748B; text-transform: uppercase;">Detalle</th>
                                <th style="padding: 16px; text-align: right;"></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    },

    bindSnapshotEvents() {
        if (document.getElementById('btn-new-snap'))
            document.getElementById('btn-new-snap').onclick = () => this.openSnapshotModal();
    },

    async deleteVersion(id) {
        if (!confirm("⚠️ ¿Estás seguro de eliminar esta versión histórica?\n\nEsta acción borrará permanentemente el snapshot y NO se puede deshacer.")) return;
        try {
            await api.delete(`/admin/presupuesto/versiones/${id}`);
            ui.showToast("Versión eliminada correctamente");
            this.render();
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        }
    },

    async openComparison(id, name) {
        ui.showToast("Cargando comparativa...");
        try {
            const data = await api.get(`/admin/presupuesto/comparar/${id}?anio=${this.selectedYear}`);
            const k = data.kpis;

            const fmt = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
            const diffColor = k.variacion_neta > 0 ? '#EF4444' : '#10B981';

            let projRows = data.proyectos.map(p => {
                const pColor = p.diff > 0 ? '#EF4444' : (p.diff < 0 ? '#10B981' : '#64748B');
                return `
                    <tr style="border-bottom: 1px solid #F1F5F9;">
                        <td style="padding: 12px; font-size: 13px;">${p.proyecto}</td>
                        <td style="padding: 12px; font-size: 13px; text-align: right;">${fmt(p.base)}</td>
                        <td style="padding: 12px; font-size: 13px; text-align: right; font-weight: 600;">${fmt(p.actual)}</td>
                        <td style="padding: 12px; font-size: 13px; text-align: right; font-weight: 800; color: ${pColor};">
                            ${p.diff > 0 ? '+' : ''}${fmt(p.diff)}
                        </td>
                        <td style="padding: 12px; font-size: 13px; text-align: center;">${p.head_base} ➔ ${p.head_live}</td>
                    </tr>
                `;
            }).join('');

            const sectionStyle = 'margin-top: 32px; margin-bottom: 12px; font-size: 13px; font-weight: 800; color: #1E293B; text-transform: uppercase; border-bottom: 2px solid #F1F5F9; padding-bottom: 8px;';
            const tableHeaderStyle = 'background: #F8FAFC; border-bottom: 1px solid #E2E8F0;';
            const tdStyle = 'padding: 10px; font-size: 12px; border-bottom: 1px solid #F1F5F9;';

            // Details for structure changes
            const structRows = [
                ...data.detalle_cambios.nuevos.map(x => `<tr style="color: #10B981;"><td style="${tdStyle}">NEW</td><td style="${tdStyle}">${x.nombre}</td><td style="${tdStyle}">${x.id_proyecto}</td><td style="${tdStyle}; text-align: right;">${fmt(x.salario_t)}</td></tr>`),
                ...data.detalle_cambios.eliminados.map(x => `<tr style="color: #EF4444;"><td style="${tdStyle}">DEL</td><td style="${tdStyle}">${x.nombre}</td><td style="${tdStyle}">${x.id_proyecto}</td><td style="${tdStyle}; text-align: right;">-${fmt(x.salario_t)}</td></tr>`)
            ].join('');

            // Details for value changes
            const modRows = data.detalle_cambios.modificados.map(x => `
                <tr>
                    <td style="${tdStyle}">${x.nombre}</td>
                    <td style="${tdStyle}">${x.id_proyecto}</td>
                    <td style="${tdStyle}; text-align: right;">${fmt(x.valor_base)}</td>
                    <td style="${tdStyle}; text-align: right;">${fmt(x.valor_actual)}</td>
                    <td style="${tdStyle}; text-align: right; font-weight: 700; color: ${x.diff > 0 ? '#EF4444' : '#10B981'};">${x.diff > 0 ? '+' : ''}${fmt(x.diff)}</td>
                </tr>
            `).join('');

            const html = `
                <div style="max-height: 85vh; overflow-y: auto; padding: 4px;">
                    <div style="margin-bottom: 20px; background: #FFFBEB; border: 1px solid #FEF3C7; padding: 12px; border-radius: 12px; display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 20px;">ℹ️</span>
                        <div style="font-size: 13px; color: #92400E; font-weight: 600;">
                            Comparando carga prestacional proyectada para la vigencia <strong>${data.anio}</strong>. 
                            Los valores representan el costo mensual base consolidado.
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px;">
                        <div style="background: #F8FAFC; padding: 12px; border-radius: 12px; border: 1px solid #E2E8F0;">
                            <div style="font-size: 10px; text-transform: uppercase; color: #64748B; font-weight: 800;">Variación Neta</div>
                            <div style="font-size: 18px; font-weight: 800; color: ${diffColor};">${k.variacion_neta > 0 ? '+' : ''}${fmt(k.variacion_neta)}</div>
                        </div>
                        <div style="background: #F8FAFC; padding: 12px; border-radius: 12px; border: 1px solid #E2E8F0;">
                            <div style="font-size: 10px; text-transform: uppercase; color: #64748B; font-weight: 800;">Variación %</div>
                            <div style="font-size: 18px; font-weight: 800; color: ${diffColor};">${k.porcentaje_variacion.toFixed(2)}%</div>
                        </div>
                        <div style="background: #F8FAFC; padding: 12px; border-radius: 12px; border: 1px solid #E2E8F0;">
                            <div style="font-size: 10px; text-transform: uppercase; color: #64748B; font-weight: 800;">Trabajadores Únicos</div>
                            <div style="font-size: 18px; font-weight: 800; color: #0F172A;">${k.headcount_base} ➔ ${k.headcount_actual}</div>
                        </div>
                        <div style="background: #F8FAFC; padding: 12px; border-radius: 12px; border: 1px solid #E2E8F0;">
                            <div style="font-size: 10px; text-transform: uppercase; color: #64748B; font-weight: 800;">Cambios Estructurales</div>
                            <div style="font-size: 18px; font-weight: 800; color: #0F172A;">+${k.tramos_nuevos} / -${k.tramos_eliminados}</div>
                        </div>
                    </div>

                    <h4 style="${sectionStyle}">🏢 Desviación por Proyecto (${data.anio})</h4>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <thead style="${tableHeaderStyle}">
                            <tr>
                                <th style="padding: 10px; text-align: left; font-size: 11px; color: #475569;">PROYECTO</th>
                                <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">FOTO (${data.anio})</th>
                                <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">ACTUAL (${data.anio})</th>
                                <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">DIFF</th>
                                <th style="padding: 10px; text-align: center; font-size: 11px; color: #475569;">TRABAJADORES</th>
                            </tr>
                        </thead>
                        <tbody>${projRows}</tbody>
                    </table>

                    ${structRows ? `
                        <h4 style="${sectionStyle}">🔸 Cambios de Estructura (Nuevos / Eliminados)</h4>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                            <thead style="${tableHeaderStyle}">
                                <tr>
                                    <th style="padding: 10px; text-align: left; font-size: 11px; color: #475569;">TIPO</th>
                                    <th style="padding: 10px; text-align: left; font-size: 11px; color: #475569;">PERSONA</th>
                                    <th style="padding: 10px; text-align: left; font-size: 11px; color: #475569;">PROYECTO</th>
                                    <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">VALOR</th>
                                </tr>
                            </thead>
                            <tbody>${structRows}</tbody>
                        </table>
                    ` : ''}

                    ${modRows ? `
                        <h4 style="${sectionStyle}">📈 Desviaciones por Persona (Ajustes de Valor)</h4>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="${tableHeaderStyle}">
                                <tr>
                                    <th style="padding: 10px; text-align: left; font-size: 11px; color: #475569;">PERSONA</th>
                                    <th style="padding: 10px; text-align: left; font-size: 11px; color: #475569;">PROYECTO</th>
                                    <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">BASE</th>
                                    <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">NUEVO</th>
                                    <th style="padding: 10px; text-align: right; font-size: 11px; color: #475569;">DIFF</th>
                                </tr>
                            </thead>
                            <tbody>${modRows}</tbody>
                        </table>
                    ` : ''}
                </div>
            `;

            ui.openModal(`Análisis: ${name} vs Estado Actual`, html);
        } catch (e) {
            console.error(e);
            alert("Error al cargar la comparativa");
        }
    },

    openSnapshotModal() {
        const modalId = 'cp-modal-create';
        if (document.getElementById(modalId)) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = modalId;
        modalDiv.className = 'cp-modal-overlay';
        modalDiv.innerHTML = `
            <div class="cp-modal-content">
                <div style="background: #F8FAFC; padding: 20px 24px; border-bottom: 1px solid #E2E8F0;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #0F172A;">📸 Nueva Foto del Presupuesto</h3>
                    <p style="margin: 4px 0 0 0; color: #64748B; font-size: 13px;">Congelar estado actual de BFinanciacion</p>
                </div>
                
                <div style="padding: 24px;">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 11px; fontWeight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">Nombre de la Versión</label>
                        <input type="text" id="snap-name" placeholder="Ej: Presupuesto Inicial 2026" 
                            style="width: 100%; padding: 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; font-weight: 600; outline: none; transition: border 0.2s;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 11px; fontWeight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 6px;">Descripción (Opcional)</label>
                        <textarea id="snap-desc" rows="3" placeholder="Notas adicionales..." 
                            style="width: 100%; padding: 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; resize: none;"></textarea>
                    </div>
                    
                    <div style="margin-top: 20px; background: #FFFBEB; border: 1px solid #FEF3C7; padding: 12px; border-radius: 8px; display: flex; gap: 12px;">
                        <span style="font-size: 20px;">⚠️</span>
                        <p style="margin: 0; font-size: 12px; color: #92400E; line-height: 1.4;">
                            Se generará una copia inmutable de todos los registros financieros actuales.
                        </p>
                    </div>
                </div>

                <div style="padding: 16px 24px; background: #F8FAFC; border-top: 1px solid #E2E8F0; display: flex; justify-content: flex-end; gap: 12px;">
                    <button id="btn-cancel-snap" style="padding: 10px 20px; border: 1px solid #E2E8F0; background: white; border-radius: 8px; font-weight: 700; color: #64748B; cursor: pointer;">Cancelar</button>
                    <button id="btn-confirm-snap" style="padding: 10px 24px; background: #0F172A; color: white; border-radius: 8px; font-weight: 700; border: none; cursor: pointer;">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);
        const close = () => modalDiv.remove();
        modalDiv.querySelector('#btn-cancel-snap').onclick = close;

        modalDiv.querySelector('#btn-confirm-snap').onclick = async () => {
            const name = document.getElementById('snap-name').value;
            const desc = document.getElementById('snap-desc').value;
            if (!name) return alert("Ingrese un nombre");
            const btn = document.getElementById('btn-confirm-snap');
            btn.innerHTML = "⏳ Procesando..."; btn.disabled = true;

            try {
                const res = await api.post('/admin/presupuesto/congelar', { nombre_version: name, descripcion: desc });
                if (res.version_id) {
                    ui.showToast(`✅ Snapshot creado: ${res.tramos_copiados} registros`);
                    close();
                    this.render(); // Reload view
                } else { throw new Error("Fallo"); }
            } catch (e) {
                alert("Error al crear snapshot");
                btn.innerHTML = "Confirmar";
                btn.disabled = false;
            }
        };
    }
};
