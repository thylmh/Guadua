
import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';

export const auditoria = {
    async render() {
        if (!auth.isAdmin()) {
            window.location.hash = '#/home';
            return;
        }

        const container = document.getElementById('auditoria-module-container');
        if (!container) return;

        container.innerHTML = `
            <div id="audit-stats" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                <!-- Stats loaded dynamically -->
                <div class="luxury-card flex align-center justify-center p-4">Loading stats...</div>
            </div>

            <div class="luxury-card">
                <div class="flex justify-between align-center mb-4 pb-4 border-bottom">
                    <div>
                        <h3 style="margin:0;">Bitácora de Eventos</h3>
                        <p class="text-muted" style="font-size: 13px;">Historial inmutable de acciones del sistema.</p>
                    </div>
                    <button id="audit-download-btn" class="btn btn-ghost" style="border: 1px solid var(--border); font-size: 13px;">
                        ⬇ Exportar Excel
                    </button>
                </div>

                <div class="flex gap-4 mb-4" style="background: #F8FAFC; padding: 12px; border-radius: 8px;">
                    <div style="flex:1;">
                        <label class="muted" style="font-size: 11px; font-weight: 700;">MÓDULO</label>
                        <select id="audit-filter-module" class="input" style="height: 36px;">
                            <option value="">Todos</option>
                            <option value="Financiacion">Financiación</option>
                            <option value="Usuarios">Usuarios</option>
                            <option value="Vacantes">Vacantes</option>
                            <option value="Incrementos">Incrementos</option>
                            <option value="Consulta">Consultas (Lectura)</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label class="muted" style="font-size: 11px; font-weight: 700;">ACCIÓN</label>
                        <select id="audit-filter-action" class="input" style="height: 36px;">
                            <option value="">Todas</option>
                            <option value="CREATE">Creación</option>
                            <option value="UPDATE">Actualización</option>
                            <option value="DELETE">Eliminación</option>
                            <option value="READ">Lectura</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label class="muted" style="font-size: 11px; font-weight: 700;">ACTOR (Email)</label>
                        <input id="audit-filter-actor" type="text" class="input" placeholder="ej. usuario@humboldt..." style="height: 36px;">
                    </div>
                    <div style="display:flex; align-items:end;">
                        <button id="audit-refresh-btn" class="btn btn-primary" style="height: 36px;">🔎 Buscar</button>
                    </div>
                </div>

                <div class="table-wrap">
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
                        <thead>
                            <tr style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: var(--text-muted);">
                                <th style="padding-left: 16px;">FECHA / HORA</th>
                                <th>MÓDULO : ACCIÓN</th>
                                <th>ACTOR</th>
                                <th>RECURSO</th>
                                <th class="text-right" style="padding-right: 16px;">DETALLE</th>
                            </tr>
                        </thead>
                        <tbody id="audit-tbody">
                            <!-- Logs here -->
                        </tbody>
                    </table>
                </div>
                
                <div id="audit-pagination" class="flex justify-center mt-4 gap-2">
                    <!-- Pagination -->
                </div>
            </div>
        `;

        this.loadStats();
        this.loadLogs();

        document.getElementById('audit-refresh-btn').onclick = () => this.loadLogs();
        document.getElementById('audit-download-btn').onclick = () => this.downloadExcel();
    },

    async loadStats() {
        try {
            const res = await api.get('/admin/auditoria/stats');
            const statsDiv = document.getElementById('audit-stats');
            if (res) {
                statsDiv.innerHTML = `
                    <div class="luxury-card" style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); color: white;">
                        <div style="font-size: 11px; text-transform: uppercase; opacity: 0.8; font-weight: 800;">Eventos Hoy</div>
                        <div style="font-size: 32px; font-weight: 900;">${res.today_events}</div>
                    </div>
                    <div class="luxury-card">
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 800;">Módulo + Activo (30d)</div>
                        <div style="font-size: 20px; font-weight: 700; color: var(--text);">${res.top_module}</div>
                    </div>
                    <div class="luxury-card">
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 800;">Usuario + Activo (30d)</div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--text); word-break: break-all;">${res.top_actor}</div>
                    </div>
                `;
            }
        } catch (e) { console.error(e); }
    },

    async loadLogs(offset = 0) {
        const tbody = document.getElementById('audit-tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4"><div class="loader-spinner"></div></td></tr>';

        const module = document.getElementById('audit-filter-module').value;
        const action = document.getElementById('audit-filter-action').value;
        const actor = document.getElementById('audit-filter-actor').value;

        let q = `?limit=20&offset=${offset}`;
        if (module) q += `&module=${module}`;
        if (action) q += `&action=${action}`;
        if (actor) q += `&actor=${actor}`;

        try {
            const res = await api.get(`/admin/auditoria${q}`);
            if (res && res.logs) {
                if (res.logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">No se encontraron eventos.</td></tr>';
                    return;
                }

                tbody.innerHTML = res.logs.map(log => this.renderRow(log)).join('');
                this.bindDetailButtons(res.logs);
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-danger">Error: ${e.message}</td></tr>`;
        }
    },

    renderRow(log) {
        const date = new Date(log.timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' });

        let actionColor = '#64748B';
        if (log.action === 'CREATE') actionColor = '#10B981';
        if (log.action === 'UPDATE') actionColor = '#F59E0B';
        if (log.action === 'DELETE') actionColor = '#EF4444';
        if (log.action === 'READ') actionColor = '#3B82F6';

        // Calculate changes summary
        let changesSummary = '-';
        if (log.action === 'UPDATE' || log.action === 'CREATE' || log.action === 'DELETE') {
            let oldObj = log.old_values;
            let newObj = log.new_values;
            try { if (typeof oldObj === 'string') oldObj = JSON.parse(oldObj); } catch (e) { }
            try { if (typeof newObj === 'string') newObj = JSON.parse(newObj); } catch (e) { }

            if (log.action === 'UPDATE' && oldObj && newObj) {
                const diffKeys = Object.keys(newObj).filter(k => {
                    const v1 = oldObj[k];
                    const v2 = newObj[k];
                    return v1 != v2;
                });
                if (diffKeys.length > 0) {
                    changesSummary = `<div style="color: var(--primary); font-weight: 600; font-size: 10px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${diffKeys.join(', ')}">${diffKeys.join(', ')}</div>`;
                }
            } else if (log.action === 'CREATE') {
                changesSummary = `<span style="color: #10B981; font-weight: 600; font-size: 10px;">NUEVO REGISTRO</span>`;
            } else if (log.action === 'DELETE') {
                changesSummary = `<span style="color: #EF4444; font-weight: 600; font-size: 10px;">ELIMINADO</span>`;
            }
        }

        return `
            <tr style="background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <td style="padding: 16px; font-size: 12px; font-family: monospace;">${date}</td>
                <td style="padding: 16px;">
                    <span style="font-weight: 700; font-size: 13px;">${log.module}</span>
                    <span style="font-size: 10px; font-weight: 800; color: ${actionColor}; background: ${actionColor}15; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${log.action}</span>
                </td>
                <td style="padding: 16px; font-size: 13px;">${log.actor_email}</td>
                <td style="padding: 16px; font-size: 12px; font-family: monospace; color: var(--text-muted);">${log.resource_id}</td>
                <td class="text-right" style="padding: 16px;">
                    <button class="btn btn-ghost btn-sm view-log-btn" data-id="${log.id}" title="Ver Diferencias">👁️</button>
                </td>
            </tr>
        `;
    },

    async downloadExcel() {
        const module = document.getElementById('audit-filter-module').value;
        const action = document.getElementById('audit-filter-action').value;
        const actor = document.getElementById('audit-filter-actor').value;

        let q = `?limit=1000&offset=0`;
        if (module) q += `&module=${module}`;
        if (action) q += `&action=${action}`;
        if (actor) q += `&actor=${actor}`;

        try {
            ui.showToast('Generando reporte Excel...', 'info');
            const res = await api.get(`/admin/auditoria${q}`);
            if (!res || !res.logs) throw new Error("No se obtuvieron datos.");

            const data = res.logs.map(log => {
                let oldObj = log.old_values;
                let newObj = log.new_values;
                try { if (typeof oldObj === 'string') oldObj = JSON.parse(oldObj); } catch (e) { }
                try { if (typeof newObj === 'string') newObj = JSON.parse(newObj); } catch (e) { }

                let diffKeys = [];
                let detailedChanges = "";

                if (log.action === 'UPDATE' && oldObj && newObj) {
                    const changes = [];
                    const filteredOld = {};
                    const filteredNew = {};

                    Object.keys(newObj).forEach(k => {
                        if (oldObj[k] != newObj[k]) {
                            changes.push(`${k}: [${oldObj[k]} -> ${newObj[k]}]`);
                            diffKeys.push(k);
                            filteredOld[k] = oldObj[k];
                            filteredNew[k] = newObj[k];
                        }
                    });

                    detailedChanges = changes.join(" | ");
                    oldObj = filteredOld;
                    newObj = filteredNew;

                } else if (log.action === 'CREATE') {
                    diffKeys = ["NUEVO"];
                    detailedChanges = "Registro Creado";
                    oldObj = "N/A";
                } else if (log.action === 'DELETE') {
                    diffKeys = ["ELIMINADO"];
                    detailedChanges = "Registro Eliminado";
                    newObj = "N/A";
                }

                // Explicit conversion to local time for Excel
                const localDate = new Date(log.timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' });

                return {
                    "ID": log.id,
                    "Fecha": localDate,
                    "Modulo": log.module,
                    "Accion": log.action,
                    "Actor": log.actor_email,
                    "Recurso": log.resource_id,
                    "IP": log.actor_ip || "N/A",
                    "Cambios_Resumen": diffKeys.join(", "),
                    "Cambios_Detalle": detailedChanges,
                    "Valores_Anteriores": (typeof oldObj === 'string') ? oldObj : JSON.stringify(oldObj).replace(/;/g, ","),
                    "Valores_Nuevos": (typeof newObj === 'string') ? newObj : JSON.stringify(newObj).replace(/;/g, ",")
                };
            });

            // generate workbook
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Eventos");

            // auto-width
            const max_width = data.reduce((w, r) => Math.max(w, r["Cambios_Detalle"].length), 10);
            worksheet["!cols"] = [
                { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 10 },
                { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
                { wch: Math.min(50, max_width) }, { wch: 50 }, { wch: 50 }
            ];

            XLSX.writeFile(workbook, `Bitacora_Auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`);
            ui.showToast('Reporte XLSX descargado con éxito', 'success');

        } catch (e) {
            console.error(e);
            ui.showToast('Error al descargar: ' + e.message, 'error');
        }
    },

    bindDetailButtons(logs) {
        document.querySelectorAll('.view-log-btn').forEach(btn => {
            btn.onclick = () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const log = logs.find(l => l.id === id);
                this.showDetail(log);
            };
        });
    },

    showDetail(log) {
        // Parse JSONs if they are strings
        let oldObj = log.old_values;
        let newObj = log.new_values;
        try { if (typeof oldObj === 'string') oldObj = JSON.parse(oldObj); } catch (e) { }
        try { if (typeof newObj === 'string') newObj = JSON.parse(newObj); } catch (e) { }

        // Helper to find differences
        const getAllKeys = (o1, o2) => {
            const k1 = o1 ? Object.keys(o1) : [];
            const k2 = o2 ? Object.keys(o2) : [];
            return Array.from(new Set([...k1, ...k2])).sort();
        };

        let diffRows = '';
        if (!oldObj && !newObj) {
            diffRows = '<tr><td colspan="3" class="text-center text-muted">No hay datos registrados.</td></tr>';
        } else if (!oldObj && newObj) {
            // Created
            Object.keys(newObj).forEach(k => {
                diffRows += `
                    <tr style="background: #ECFDF5;">
                        <td style="font-weight:600; font-size:12px;">${k}</td>
                        <td class="text-muted" style="font-size:11px;"><em>(Vacio)</em></td>
                        <td style="color:#059669; font-weight:600; font-size:11px;">${newObj[k]}</td>
                    </tr>`;
            });
        } else if (oldObj && !newObj) {
            // Deleted
            Object.keys(oldObj).forEach(k => {
                diffRows += `
                    <tr style="background: #FEF2F2;">
                        <td style="font-weight:600; font-size:12px;">${k}</td>
                        <td style="color:#DC2626; font-weight:600; font-size:11px;">${oldObj[k]}</td>
                        <td class="text-muted" style="font-size:11px;"><em>(Eliminado)</em></td>
                    </tr>`;
            });
        } else {
            // Modified - specific diff
            const keys = getAllKeys(oldObj, newObj);
            keys.forEach(k => {
                const v1 = oldObj ? oldObj[k] : undefined;
                const v2 = newObj ? newObj[k] : undefined;

                // Loose equality check to ignore type diffs like "100" vs 100
                if (v1 != v2) {
                    diffRows += `
                    <tr style="background: #FFFBEB;">
                        <td style="font-weight:600; font-size:12px;">${k}</td>
                        <td style="color:#DC2626; font-size:11px;">${v1 !== undefined ? v1 : '<em>(N/A)</em>'}</td>
                        <td style="color:#059669; font-weight:600; font-size:11px;">${v2 !== undefined ? v2 : '<em>(N/A)</em>'}</td>
                    </tr>`;
                } else {
                    // Unchanged (Optional: Hide or show dimmed)
                    // limit unchanged rows to avoid clutter? Let's show all for context but simplified
                    // diffRows += `<tr><td style="font-size:11px; opacity:0.5;">${k}</td><td colspan="2" style="font-size:11px; opacity:0.5;">${v1}</td></tr>`;
                }
            });
            if (!diffRows) diffRows = '<tr><td colspan="3" class="text-center text-muted">Sin cambios detectados en los valores.</td></tr>';
        }

        const html = `
            <div style="background: #F8FAFC; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #E2E8F0;">
                <div class="flex justify-between align-center mb-2">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">${log.module}</span>
                    <span style="font-size: 10px; background: #E2E8F0; padding: 2px 6px; border-radius: 4px;">ID: ${log.resource_id}</span>
                </div>
                <h3 style="margin: 0 0 8px 0; font-size: 16px;">${log.details || 'Acción registrada'}</h3>
                
                <div class="grid gap-2" style="grid-template-columns: 1fr 1fr; font-size: 12px; color: var(--text-muted);">
                    <div>👤 <strong>Actor:</strong> ${log.actor_email}</div>
                    <div>📅 <strong>Fecha:</strong> ${new Date(log.timestamp).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</div>
                    <div>💻 <strong>IP:</strong> ${log.actor_ip || 'N/A'}</div>
                </div>
            </div>
            
            <div class="table-wrap" style="max-height: 400px; overflow-y: auto; border: 1px solid #E2E8F0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: white; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                        <tr style="text-align: left; background: #F1F5F9; font-size: 11px; text-transform: uppercase;">
                            <th style="padding: 10px; width: 30%;">Campo</th>
                            <th style="padding: 10px; width: 35%; color: #DC2626;">Valor Anterior</th>
                            <th style="padding: 10px; width: 35%; color: #059669;">Valor Nuevo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${diffRows}
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 16px; text-align: right;">
                 <button class="btn btn-ghost btn-sm" onclick="document.querySelector('.modal-overlay').classList.add('hidden')">Cerrar</button>
            </div>
        `;
        ui.openModal(`Auditoría #${log.id}`, html);
    }
};
