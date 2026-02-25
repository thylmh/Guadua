import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';

export const gestionSolicitudes = {
    requests: [],
    catalogs: null,

    async load() {
        const target = document.getElementById('solicitudes-container');
        if (!target) return console.error('Target solicitudes-container not found');

        target.innerHTML = `
            <div class="fade-in-up">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 700; color: var(--primary-dark); margin: 0;">Gestión de Solicitudes</h2>
                        <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">Auditoría y aprobación de cambios presupuestales</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.gestionSolicitudes.render()" class="btn-secondary" style="padding: 8px 12px; font-size: 13px;">
                            🔄 Actualizar
                        </button>
                    </div>
                </div>

                <!-- Stats Cards -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
                    <div class="stat-card" style="background: linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%); border: 1px solid #FED7AA;">
                        <span style="font-size: 12px; font-weight: 600; color: #9A3412; text-transform: uppercase; letter-spacing: 0.5px;">Pendientes</span>
                        <div id="stat-pending" style="font-size: 32px; font-weight: 800; color: #9A3412; margin-top: 8px;">0</div>
                    </div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%); border: 1px solid #BBF7D0;">
                        <span style="font-size: 12px; font-weight: 600; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Aprobadas (Mes)</span>
                        <div id="stat-approved" style="font-size: 32px; font-weight: 800; color: #166534; margin-top: 8px;">0</div>
                    </div>
                    <div class="stat-card" style="background: linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%); border: 1px solid #FECACA;">
                        <span style="font-size: 12px; font-weight: 600; color: #991B1B; text-transform: uppercase; letter-spacing: 0.5px;">Rechazadas (Mes)</span>
                        <div id="stat-rejected" style="font-size: 32px; font-weight: 800; color: #991B1B; margin-top: 8px;">0</div>
                    </div>
                </div>

                <!-- Filters -->
                <div style="background: white; padding: 12px 16px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); margin-bottom: 24px; display: flex; gap: 12px; align-items: center;">
                    <div style="position: relative; flex: 2; min-width: 200px;">
                        <span style="position: absolute; left: 12px; top: 12px; color: #94A3B8; font-size: 14px;">🔍</span>
                        <input type="text" id="req-search" placeholder="Busca por cédula, solicitante o ID..." 
                            style="width: 100%; padding: 10px 12px 10px 38px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; background: #F8FAFC;">
                    </div>
                    
                    <div style="flex: 1; min-width: 160px;">
                        <select id="req-filter-status" style="width: 100%; padding: 10px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; background: white;">
                            <option value="PENDIENTE">⏳ Solo Pendientes</option>
                            <option value="ALL">📋 Histórico Completo</option>
                        </select>
                    </div>

                    <div style="flex: 1; min-width: 160px;">
                        <select id="req-filter-user" style="width: 100%; padding: 10px 12px; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 14px; outline: none; background: white;">
                            <option value="ALL">👤 Todos los Solicitantes</option>
                        </select>
                    </div>

                    <div style="display: flex; align-items: center; gap: 8px; border: 1px solid #E2E8F0; padding: 6px 12px; border-radius: 8px; background: white; min-width: 180px;">
                        <label style="font-size: 10px; font-weight: 800; color: #64748B; text-transform: uppercase; margin: 0;">Mes:</label>
                        <input type="month" id="req-filter-month" style="border: none; font-size: 14px; outline: none; color: #1E293B; font-weight: 700; width: 100%;">
                    </div>
                </div>

                <!-- Table -->
                <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); overflow: hidden;">
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #F8FAFC; border-bottom: 1px solid #E2E8F0;">
                                <tr>
                                    <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Tipo</th>
                                    <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">ID Afectado</th>
                                    <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Cédula</th>
                                    <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Solicitud</th>
                                    <th style="text-align: center; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Detalle</th>
                                    <th style="text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Estado</th>
                                    <th style="text-align: right; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #64748B; text-transform: uppercase;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="req-table-body">
                                <tr><td colspan="7" style="padding: 32px; text-align: center; color: #94A3B8;">Cargando solicitudes...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <style>
                .stat-card { padding: 16px; border-radius: 12px; transition: transform 0.2s; }
                .stat-card:hover { transform: translateY(-2px); }
                .req-row:hover { background: #F8FAFC; }
                .badge { padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; }
                .badge-PENDIENTE { background: #FFF7ED; color: #C2410C; border: 1px solid #FFEDD5; }
                .badge-APROBADO { background: #F0FDF4; color: #15803D; border: 1px solid #BBF7D0; }
                .badge-RECHAZADO { background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; }
                .action-btn { border: none; border-radius: 6px; padding: 6px 10px; cursor: pointer; transition: all 0.2s; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
                .btn-approve { background: #DCFCE7; color: #166534; } .btn-approve:hover { background: #BBF7D0; }
                .btn-reject { background: #FEE2E2; color: #991B1B; } .btn-reject:hover { background: #FECACA; }
            </style>
        `;

        // Bind events
        document.getElementById('req-filter-status').onchange = () => this.renderList();
        document.getElementById('req-filter-user').onchange = () => this.renderList();
        document.getElementById('req-filter-month').onchange = () => this.renderList();

        window.gestionSolicitudes = this;
        await this.render();
    },

    async loadCatalogos() {
        try {
            this.catalogs = await api.get('/employees/catalogos');
        } catch (e) {
            console.error("Error loading catalogs", e);
        }
    },

    async render() {
        if (!this.catalogs) await this.loadCatalogos();
        try {
            this.requests = await api.get('/admin/presupuesto/solicitudes');
            this.populateUserFilter();
            this.renderStats();
            this.renderList();
        } catch (err) {
            console.error(err);
        }
    },

    populateUserFilter() {
        const select = document.getElementById('req-filter-user');
        if (!select) return;
        const current = select.value;
        const users = [...new Set(this.requests.map(r => r.solicitante).filter(Boolean))].sort();

        select.innerHTML = '<option value="ALL">👤 Todos los Solicitantes</option>' +
            users.map(u => `<option value="${u}">${u}</option>`).join('');

        if (users.includes(current)) {
            select.value = current;
        }
    },

    renderStats() {
        const stats = { pending: 0, approved: 0, rejected: 0 };
        this.requests.forEach(r => {
            if (r.estado === 'PENDIENTE') stats.pending++;
            else if (r.estado === 'APROBADO') stats.approved++;
            else if (r.estado === 'RECHAZADO') stats.rejected++;
        });

        document.getElementById('stat-pending').textContent = stats.pending;
        document.getElementById('stat-approved').textContent = stats.approved;
        document.getElementById('stat-rejected').textContent = stats.rejected;
    },

    keyupHandler() {
        if (this._searchTimeout) clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => this.renderList(), 300);
    },

    renderList() {
        const tbody = document.getElementById('req-table-body');
        const statusFilter = document.getElementById('req-filter-status').value;
        const userFilter = document.getElementById('req-filter-user').value;
        const monthFilter = document.getElementById('req-filter-month').value;
        const search = document.getElementById('req-search').value.toLowerCase();

        const filtered = this.requests.filter(r => {
            const matchesStatus = statusFilter === 'ALL' ? true : r.estado === statusFilter;
            const matchesUser = userFilter === 'ALL' ? true : r.solicitante === userFilter;
            let matchesMonth = true;
            if (monthFilter && r.fecha_solicitud) {
                const reqMonth = r.fecha_solicitud.substring(0, 7);
                matchesMonth = reqMonth === monthFilter;
            }
            const matchesSearch =
                (r.cedula || '').toLowerCase().includes(search) ||
                (r.solicitante || '').toLowerCase().includes(search) ||
                (r.id_financiacion_afectado || '').toLowerCase().includes(search);
            return matchesStatus && matchesUser && matchesMonth && matchesSearch;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="padding: 32px; text-align: center; color: #94A3B8;">No se encontraron solicitudes.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.map(r => {
            const tipo = r.tipo_solicitud || 'N/A';
            const fid = r.id_financiacion_afectado || 'N/A';
            const cedula = r.cedula || '-';
            const fecha = r.fecha_solicitud;

            let diffHtml = '';
            const fieldLabels = {
                'valor_mensual': 'Valor Mensual',
                'salario_base': 'Salario Base',
                'fecha_inicio': 'Fecha Inicio',
                'fecha_fin': 'Fecha Fin',
                'id_proyecto': 'Proyecto',
                'id_fuente': 'Fuente'
            };

            try {
                const oldD = r.datos_anteriores ? (typeof r.datos_anteriores === 'string' ? JSON.parse(r.datos_anteriores) : r.datos_anteriores) : {};
                const newD = r.datos_nuevos ? (typeof r.datos_nuevos === 'string' ? JSON.parse(r.datos_nuevos) : r.datos_nuevos) : {};

                if (tipo === 'MODIFICACION') {
                    const changes = [];
                    for (const key in newD) {
                        if (['modifico', 'fecha_modificacion', 'id_financiacion', 'pago_proyectado'].includes(key)) continue;
                        if (newD[key] != oldD[key] && newD[key] !== undefined) {
                            let valStr = newD[key];
                            if (key.includes('salario') || key === 'valor_mensual') valStr = ui.money(newD[key]);
                            changes.push(`<div style="font-size: 11px;"><b>${fieldLabels[key] || key}:</b> <span style="color: #10B981; font-weight: 600;">➝ ${valStr}</span></div>`);
                        }
                    }
                    diffHtml = changes.slice(0, 2).join('') + (changes.length > 2 ? '...' : '');
                    if (!diffHtml) diffHtml = '<span style="color: #94A3B8;">(Sin cambios detectados)</span>';
                } else if (tipo === 'CREACION') {
                    diffHtml = `<div style="color: #10B981; font-weight: 800; font-size: 11px;">✨ Nuevo: ${ui.money(newD.salario_base || 0)}</div>`;
                } else {
                    diffHtml = `<div style="color: #EF4444; font-size: 11px; font-weight: 700;">🗑️ ELIMINAR REGISTRO</div>`;
                }
            } catch (e) { diffHtml = 'Err data'; }

            const canApprove = auth.isAdmin();
            const actions = (r.estado === 'PENDIENTE' && canApprove) ? `
                <div style="display: flex; gap: 4px; justify-content: flex-end;">
                    <button onclick="window.gestionSolicitudes.approve(${r.id})" class="action-btn btn-approve">✅</button>
                    <button onclick="window.gestionSolicitudes.reject(${r.id})" class="action-btn btn-reject">❌</button>
                </div>
            ` : `<span style="color: #64748B; font-size: 10px; font-weight: 700;">${r.estado}</span>`;

            return `
                <tr class="req-row" style="border-bottom: 1px solid #F1F5F9;">
                    <td style="padding: 12px 16px;"><span class="badge badge-${tipo}" style="font-size: 9px;">${tipo}</span></td>
                    <td style="padding: 12px 16px; font-family: monospace; font-size: 11px; color: #64748B;">${fid}</td>
                    <td style="padding: 12px 16px; font-weight: 700; color: #0F172A;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${cedula}
                            ${cedula !== '-' ? `
                            <button onclick="window.navigateToConsulta('${cedula}')" class="action-btn" title="Ir a Consulta Individual" 
                                style="padding: 4px 6px; background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE;">
                                👤
                            </button>
                            ` : ''}
                        </div>
                    </td>
                    <td style="padding: 12px 16px;">${diffHtml}</td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <button onclick="window.gestionSolicitudes.viewDetail(${r.id})" class="action-btn" title="Ver Detalle" style="background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1;">
                            🔍
                        </button>
                    </td>
                    <td style="padding: 12px 16px;"><span class="badge badge-${r.estado}">${r.estado}</span></td>
                    <td style="padding: 12px 16px; text-align: right;">${actions}</td>
                </tr>
            `;
        }).join('');
    },

    viewDetail(id) {
        const r = this.requests.find(req => req.id === id);
        if (!r) return;

        const oldD = r.datos_anteriores ? (typeof r.datos_anteriores === 'string' ? JSON.parse(r.datos_anteriores) : r.datos_anteriores) : {};
        const newD = r.datos_nuevos ? (typeof r.datos_nuevos === 'string' ? JSON.parse(r.datos_nuevos) : r.datos_nuevos) : {};

        const getName = (listName, val) => {
            if (!this.catalogs || !this.catalogs[listName]) return val;
            const item = this.catalogs[listName].find(x => String(x.id) === String(val));
            return item ? (item.nombre || item.id) : val;
        };

        const fieldLabels = {
            'salario_base': { label: 'Salario Base', type: 'money' },
            'fecha_inicio': { label: 'Fecha Inicio', type: 'date' },
            'fecha_fin': { label: 'Fecha Fin', type: 'date' },
            'id_proyecto': { label: 'Proyecto', type: 'catalog', list: 'proyectos' },
            'id_fuente': { label: 'Fuente', type: 'catalog', list: 'fuentes' },
            'id_componente': { label: 'Componente', type: 'catalog', list: 'componentes' },
            'id_subcomponente': { label: 'Subcomponente', type: 'catalog', list: 'subcomponentes' },
            'id_categoria': { label: 'Categoría', type: 'catalog', list: 'categorias' },
            'id_responsable': { label: 'Responsable', type: 'catalog', list: 'responsables' },
            'rubro': { label: 'Rubro' }
        };

        let rowsHtml = '';
        const allKeys = new Set([...Object.keys(oldD), ...Object.keys(newD)]);
        const ignore = ['modifico', 'fecha_modificacion', 'id_financiacion', 'pago_proyectado', 'id_contrato', 'posicion', 'cedula', 'salario_t'];

        allKeys.forEach(key => {
            if (ignore.includes(key)) return;
            const valOld = oldD[key];
            const valNew = newD[key];
            if (valOld == valNew) return;

            const cfg = fieldLabels[key];
            const label = cfg?.label || key;

            const format = (v) => {
                if (v == null) return '-';
                if (cfg?.type === 'money') return ui.money(v);
                if (cfg?.type === 'date') return ui.formatDate(v);
                if (cfg?.type === 'catalog') return getName(cfg.list, v);
                return v;
            };

            rowsHtml += `
                <tr style="border-bottom: 1px solid #EDF2F7;">
                    <td style="padding: 10px; font-weight: 700; color: #4A5568; font-size: 11px;">${label}</td>
                    <td style="padding: 10px; color: #E53E3E; text-decoration: line-through; font-size: 12px;">${format(valOld)}</td>
                    <td style="padding: 10px; color: #38A169; font-weight: 700; font-size: 12px;">${format(valNew)}</td>
                </tr>
            `;
        });

        const html = `
            <div style="font-family: inherit;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                    <div style="font-size: 12px; color: #718096;">
                        <div><b>Solicitante:</b> ${r.solicitante}</div>
                        <div><b>Fecha:</b> ${new Date(r.fecha_solicitud).toLocaleString()}</div>
                    </div>
                    ${r.cedula ? `
                    <button onclick="window.ui.closeModal(); window.navigateToConsulta('${r.cedula}')" class="btn-secondary" 
                        style="padding: 6px 10px; font-size: 11px; display: flex; align-items: center; gap: 6px; border-color: #C7D2FE; color: #4F46E5; background: #F5F7FF;">
                        👤 Ir a Consulta de ${r.cedula}
                    </button>
                    ` : ''}
                </div>
                
                <div style="border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: #F7FAFC;">
                            <tr>
                                <th style="text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase;">Campo</th>
                                <th style="text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase;">Antes</th>
                                <th style="text-align: left; padding: 10px; font-size: 10px; text-transform: uppercase;">Después</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml || '<tr><td colspan="3" style="padding: 20px; text-align: center;">Sin cambios detectados</td></tr>'}</tbody>
                    </table>
                </div>

                <div style="background: #F0F9FF; border: 1px solid #BEE3F8; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-weight: 800; font-size: 10px; color: #2B6CB0; text-transform: uppercase; margin-bottom: 4px;">Justificación:</div>
                    <div style="font-size: 13px; color: #2D3748;">${r.justificacion || 'No especificada'}</div>
                </div>

                ${(r.estado === 'PENDIENTE' && auth.isAdmin()) ? `
                <div style="display: flex; gap: 12px; padding-top: 10px;">
                    <button onclick="window.gestionSolicitudes.approve(${r.id}, true)" class="btn btn-primary" style="flex: 2; justify-content: center; background: #22C55E;">Aprobar Cambio</button>
                    <button onclick="window.gestionSolicitudes.reject(${r.id}, true)" class="btn btn-ghost" style="flex: 1; justify-content: center; color: #E53E3E; border: 1px solid #FECACA;">Rechazar</button>
                </div>
                ` : ''}
            </div>
        `;

        ui.openModal(`Detalle Solicitud #${id}`, html);
    },

    async approve(id, autoClose = false) {
        if (autoClose) ui.closeModal();
        ui.confirm('Aprobar Cambio', '¿Confirma que desea aplicar estos cambios?', async () => {
            try {
                ui.showLoading("Aplicando...");
                const res = await api.post(`/admin/presupuesto/solicitudes/${id}/aprobar`);
                ui.hideLoading();
                if (res.ok) {
                    ui.showToast("Solicitud aprobada", "success");
                    this.render();
                } else {
                    alert("Error: " + (res.detail || "Error desconocido"));
                }
            } catch (e) {
                ui.hideLoading();
                alert("Error de conexión");
            }
        });
    },

    async reject(id, autoClose = false) {
        if (autoClose) ui.closeModal();
        ui.confirm('Rechazar Solicitud', '¿Desea rechazar este cambio?', async () => {
            try {
                ui.showLoading("Procesando...");
                const res = await api.post(`/admin/presupuesto/solicitudes/${id}/rechazar`);
                ui.hideLoading();
                if (res.ok) {
                    ui.showToast("Solicitud rechazada");
                    this.render();
                }
            } catch (e) {
                ui.hideLoading();
            }
        }, '❌');
    }
};
