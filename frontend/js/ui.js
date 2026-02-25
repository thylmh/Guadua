import { auth } from './modules/auth.js';

export const ui = {
    // --- FORMATTERS ---
    money(n) {
        if (n == null || isNaN(n)) return "—";
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(n);
    },

    moneyCompact(n) {
        if (n == null || isNaN(n)) return "—";
        const v = Math.abs(n);

        // Colombia: 1 Billón = 10^12. 
        if (v >= 1000000000000) {
            return (n / 1000000000000).toFixed(2) + " B"; // Real Billions
        }

        // Everything else above 1 Million is shown as Millions (e.g. 2.500 M)
        if (v >= 1000000) {
            const millions = n / 1000000;
            // Use es-CO to get "2.500,5" format
            return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(millions) + " M";
        }

        return this.money(n);
    },

    formatDate(d) {
        if (!d) return "—";
        // Avoid timezone shift: split YYYY-MM-DD
        const parts = d.split('T')[0].split('-');
        if (parts.length < 3) return d;

        // Month is 0-indexed in JS Date constructor
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        if (isNaN(date)) return d;

        return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    // --- MODAL ENGINE & LOADER ---
    showLoading(msg = "Cargando información...") {
        const loader = document.getElementById('loader');
        const text = document.getElementById('loader-msg');
        if (text) text.textContent = msg;
        loader.classList.remove('hidden');
        // Prevent scrolling background
        document.body.style.overflow = 'hidden';
    },

    hideLoading() {
        const loader = document.getElementById('loader');
        // Add fade out
        loader.style.opacity = '0';
        loader.style.transition = 'opacity 0.4s ease';

        setTimeout(() => {
            loader.classList.add('hidden');
            loader.style.opacity = '1'; // Reset for next time
            document.body.style.overflow = '';
        }, 400);
    },

    openModal(title, bodyHtml) {
        const modal = document.getElementById('modal-container');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        modal.classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modal-container').classList.add('hidden');
    },

    confirm(title, message, onConfirm, icon = '⚠️') {
        const overlay = document.getElementById('quick-alert');
        document.getElementById('alert-title').textContent = title;
        document.getElementById('alert-message').textContent = message;
        document.getElementById('alert-icon').textContent = icon;

        const actions = document.getElementById('alert-actions');
        actions.innerHTML = `
            <button id="alert-cancel" class="btn btn-ghost" style="flex: 1; justify-content: center;">Cancelar</button>
            <button id="alert-ok" class="btn btn-primary" style="flex: 1; justify-content: center; background: var(--primary);">Continuar</button>
        `;

        overlay.classList.remove('hidden');

        document.getElementById('alert-cancel').onclick = () => overlay.classList.add('hidden');
        document.getElementById('alert-ok').onclick = () => {
            overlay.classList.add('hidden');
            onConfirm();
        };
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '⚠️';

        toast.innerHTML = `
            <div style="font-size: 18px;">${icon}</div>
            <div style="font-size: 13px; font-weight: 500; color: var(--text);">${message}</div>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // --- KPI & DASHBOARD ---
    updateKPIs(data) {
        if (data.total !== undefined) document.getElementById('kpi-total').textContent = this.moneyCompact(data.total);
        if (data.empleados !== undefined) document.getElementById('kpi-servidores').textContent = data.empleados;
        if (data.proyectos !== undefined) document.getElementById('kpi-proyectos').textContent = data.proyectos;
    },

    renderDirectionMatrix(containerId, data) {
        const matrix = document.getElementById(containerId);
        if (!matrix) return;
        matrix.innerHTML = "";
        const sorted = Object.keys(data).sort((a, b) => data[b] - data[a]);
        const max = Math.max(...Object.values(data));

        sorted.forEach(dir => {
            const val = data[dir];
            const pct = max > 0 ? (val / max * 100) : 0;
            const row = document.createElement('div');
            row.className = "mb-4";
            row.innerHTML = `
                <div class="flex justify-between mb-1" style="font-size: 11px; font-weight: 700;">
                    <span>${dir}</span>
                    <span>${this.moneyCompact(val)}</span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width: ${pct}%"></div></div>
            `;
            matrix.appendChild(row);
        });
    },

    renderProjectTable(tableId, data) {
        const tbody = document.querySelector(`#${tableId} tbody`);
        if (!tbody) return;
        tbody.innerHTML = "";

        // Convert object to array and sort
        const items = Object.keys(data).map(key => ({
            name: key,
            total: data[key].total
        })).sort((a, b) => b.total - a.total).slice(0, 10); // Top 10

        const grandTotal = items.reduce((acc, curr) => acc + curr.total, 0);

        items.forEach(item => {
            const pct = grandTotal > 0 ? (item.total / grandTotal * 100).toFixed(1) : 0;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight: 600; color: var(--primary-dark);">${item.name}</td>
                <td class="text-right">${this.moneyCompact(item.total)}</td>
                <td class="text-right"><div class="category-pill">${pct}%</div></td>
            `;
            tbody.appendChild(row);
        });
    },

    // --- INDIVIDUAL VIEWS ---
    renderProfile(data) {
        const { empleado, cabecera, tramos, months, catalogs, alerta_inactivo, pendingRequests, availableYears, selectedYear, resumen_proyectos } = data; // Receive catalogs and alert
        const container = document.getElementById('employee-profile-container');

        // Helper: Resolve Name from Catalog
        const getName = (listName, id) => {
            if (!catalogs || !catalogs[listName]) return id || '-';
            // Force string comparison to avoid '1' !== 1 issues
            const item = catalogs[listName].find(x => String(x.id) === String(id));
            if (!item) return id || '-';
            // If the name is empty/null, better to show ID than nothing, or show "Sin Nombre"
            return item.nombre || item.id || '-';
        };

        // Helper for sections
        const sectionHeader = (title) => `<div style="background: rgba(0,77,103,0.05); color: var(--primary); padding: 4px 12px; border-radius: 50px; font-size: 10px; font-weight: 800; text-transform: uppercase; display: inline-block; margin-bottom: 12px; letter-spacing: 0.05em;">${title}</div>`;
        const dataRow = (label, value) => `<div class="flex justify-between mb-2" style="font-size: 13px;"><span class="text-muted">${label}:</span><span style="font-weight: 600;">${value || '-'}</span></div>`;

        // --- 1. DATOS DEL EMPLEADO (Image 1) ---
        // --- GLOBAL HELPERS FOR HTML CLICKS ---
        window.showLiquidacion = (monthKey) => {
            const mData = months.find(m => m.anioMes === monthKey);
            if (mData) this.renderLiquidacionModal(mData, catalogs);
        };

        window.showProjectDetails = (monthKey) => {
            const mData = months.find(m => m.anioMes === monthKey);
            if (mData) this.renderProjectDetailsModal(mData, catalogs);
        };

        container.innerHTML = `
            ${alerta_inactivo ? `
                <div class="luxury-card mb-4" style="background: #FEF2F2; border-left: 4px solid #EF4444;">
                    <div style="display: flex; align-items: center; gap: 12px; color: #991B1B;">
                        <span style="font-size: 24px;">⚠️</span>
                        <div>
                            <div style="font-weight: 800; font-size: 14px; text-transform: uppercase;">Estado: ${cabecera.ESTADO || 'Inactivo'}</div>
                            <div style="font-size: 13px;">${alerta_inactivo}</div>
                        </div>
                    </div>
                </div>
            ` : ''}
            <div class="luxury-card mb-4">
                <h3 class="mb-4" style="font-size: 14px; text-transform: uppercase; color: var(--primary);">👤 Datos del Empleado</h3>
                <div style="background: rgba(0,77,103,0.03); padding: 16px; border-radius: 12px; margin-bottom: 24px;">
                    <label class="text-muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">TRABAJADOR</label>
                    <h1 style="font-size: 24px; color: var(--primary-dark); margin: 4px 0;">${empleado.nombre}</h1>
                    <div style="font-size: 12px; color: var(--text-muted);">C.C. ${empleado.cedula}</div>
                </div>

                <div class="mb-4">
                    <div class="flex align-center gap-2 mb-2" style="color: var(--accent);">
                        <span style="font-size: 16px;">📍</span><strong style="font-size: 12px; text-transform: uppercase;">Unidad Organizacional</strong>
                    </div>
                    <div class="luxury-grid">
                        <div class="span-6" style="background: white; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                            <label class="text-muted" style="font-size: 10px; font-weight: 700;">DIRECCIÓN</label>
                            <div style="font-weight: 600; font-size: 13px;">${cabecera.DIRECCION}</div>
                        </div>
                        <div class="span-6" style="background: white; padding: 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                            <label class="text-muted" style="font-size: 10px; font-weight: 700;">GERENCIA / GRUPO</label>
                            <div style="font-weight: 600; font-size: 13px;">${cabecera.GERENCIA || 'Grupo de Trabajo'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2. INFORMACIÓN DEL CONTRATO (Boxed Style) -->
            <div class="luxury-card mb-4">
                 <div class="flex align-center gap-2 mb-4" style="color: var(--primary-light);">
                    <span style="font-size: 16px;">📄</span><strong style="font-size: 12px; text-transform: uppercase;">Información del Contrato</strong>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    <!-- Box 1: Perfil & Posición -->
                    <div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border);">
                        <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 14px;">👤</span> Perfil & Posición
                        </div>
                        ${dataRow('Cargo', cabecera.CARGO)}
                        ${dataRow('Rol', cabecera.ROL)}
                        ${dataRow('Banda', cabecera.BANDA)}
                        ${dataRow('Fuente de Fin.', cabecera.FUEN_FINAN)}
                        ${dataRow('Planta', cabecera.PLANTA)}
                        ${dataRow('Tipo Planta', cabecera.TPLANTA)}
                    </div>

                    <!-- Box 2: Gestión Contractual -->
                    <div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border);">
                        <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 14px;">📝</span> Gestión Contractual
                        </div>
                        ${dataRow('N° Contrato', cabecera.NUM_CONTRATO)}
                        ${dataRow('ID Contrato', cabecera.IDCONTRATO || 'IHCON_000')}
                        ${dataRow('Posición', cabecera.POSICION)}
                        ${dataRow('Prórrogas', Math.floor(cabecera.PRORROGAS || 0))}
                    </div>

                    <!-- Box 3: Periodo & Riesgos -->
                    <div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border);">
                        <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 14px;">📅</span> Periodo & Riesgos
                        </div>
                        ${dataRow('F. Ingreso', this.formatDate(cabecera.FECHA_INGRESO))}
                        ${dataRow('F. Terminación', this.formatDate(cabecera.F_TERMINACION))}
                        ${cabecera.F_TERMINACION_REAL ? dataRow('F. Retiro Real', this.formatDate(cabecera.F_TERMINACION_REAL)) : ''}
                        ${dataRow('Estado', cabecera.ESTADO)}
                        ${dataRow('Nivel Riesgo', cabecera.NIVEL_RIESGO)}
                        ${dataRow('Tasa ARL', (parseFloat(cabecera.ATEP || 0) * 100).toFixed(3) + '%')}
                    </div>
                </div>
            </div>

            <!-- 3. CARGA SALARIAL PROYECTADA (Synced with Liquidacion) -->
             <div class="luxury-card mb-4">
                 <div class="flex align-center gap-2 mb-4" style="color: var(--warning);">
                    <span style="font-size: 16px;">💰</span><strong style="font-size: 12px; text-transform: uppercase;">Carga Salarial Mensual Estimada ${selectedYear}</strong>
                </div>

                ${(() => {
                // 1. Calculate Aggregated Totals from the first month (Standard Month)
                // If no months, fallback to 0
                if (!months || months.length === 0) return '<div class="text-muted">No hay proyección disponible.</div>';

                // Use the month with the HIGHEST total as sample (requested by user)
                const refMonth = [...months].reduce((prev, current) => (prev.total > current.total) ? prev : current);
                const mDetails = refMonth.detalle || [];

                // Accumulators
                let acc = {
                    salario_mes: 0, aux_transporte: 0, dotacion: 0,
                    primas: 0, cesantias: 0, i_cesantias: 0, sueldo_vacaciones: 0, prima_vacaciones: 0,
                    salud: 0, pension: 0, arl: 0,
                    ccf: 0, sena: 0, icbf: 0
                };

                mDetails.forEach(d => {
                    const c = d.conceptos;
                    if (c) {
                        Object.keys(acc).forEach(key => {
                            acc[key] += (c[key] || 0);
                        });
                    }
                });

                // Groups
                const totalSal = acc.salario_mes + acc.aux_transporte + acc.dotacion;
                const totalPres = acc.primas + acc.cesantias + acc.i_cesantias + acc.sueldo_vacaciones + acc.prima_vacaciones;
                const totalSS = acc.salud + acc.pension + acc.arl;
                const totalPara = acc.ccf + acc.sena + acc.icbf;

                // Inline Card Helper
                const card = (title, icon, content, totalName, totalVal, colorClass) => `
                        <div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border); display: flex; flex-direction: column;">
                            <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 14px;">${icon}</span> ${title}
                            </div>
                            <div style="flex: 1;">
                                ${content}
                            </div>
                            <div class="flex justify-between mt-3 pt-3 border-top" style="font-weight: 700; font-size: 13px; color: var(--${colorClass || 'text'});">
                                <span>${totalName}</span><span>${this.money(totalVal)}</span>
                            </div>
                        </div>
                    `;

                return `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px;">
                            ${card('Salario & Base', '💰', `
                                ${dataRow('Sueldo', this.money(acc.salario_mes))}
                                ${dataRow('Aux. Transporte', this.money(acc.aux_transporte))}
                                ${dataRow('Dotación', this.money(acc.dotacion))}
                            `, 'Total', totalSal, 'primary')}

                            ${card('Prestaciones', '🏖️', `
                                ${dataRow('Primas', this.money(acc.primas))}
                                ${dataRow('Vacaciones', this.money(acc.sueldo_vacaciones + acc.prima_vacaciones))}
                                ${dataRow('Cesantías', this.money(acc.cesantias))}
                                ${dataRow('Int. Cesantías', this.money(acc.i_cesantias))}
                            `, 'Total', totalPres, 'primary')}

                            ${card('Seguridad Social', '🏥', `
                                ${dataRow('Salud', this.money(acc.salud))}
                                ${dataRow('Pensión', this.money(acc.pension))}
                                ${dataRow('ARL', this.money(acc.arl))}
                            `, 'Total', totalSS, 'text')}

                            ${card('Parafiscales', '🏢', `
                                ${dataRow('Caja Comp.', this.money(acc.ccf))}
                                ${dataRow('SENA', this.money(acc.sena))}
                                ${dataRow('ICBF', this.money(acc.icbf))}
                            `, 'Total', totalPara, 'text')}
                        </div>

                        <!-- TOTAL FOOTER -->
                        <div style="background: var(--primary-dark); color: white; padding: 24px; border-radius: 16px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; opacity: 0.8; margin-bottom: 8px;">TOTAL CARGA SALARIAL MENSUAL (APROX)</div>
                            <div style="font-size: 36px; font-weight: 900;">${this.money(refMonth.total)}</div>
                            <div style="font-size: 10px; opacity: 0.6; margin-top: 4px;">Basado en la proyección de ${refMonth.anioMes}</div>
                        </div>
                    `;
            })()}
            </div>

            <!-- 4. TRAMOS (Image 3) - NOW RESOLVING NAMES -->
            <div class="luxury-card mb-4">
                <div class="flex justify-between align-center mb-4 pb-2 border-bottom">
                    <div class="flex align-center gap-2">
                        <span style="font-size: 16px;">📋</span>
                        <strong style="font-size: 12px; text-transform: uppercase;">Tramos de Financiación</strong>
                    </div>
                    ${(auth.isAdmin() || (auth._user?.role === 'financiero' && new Date().getDate() <= 6)) ? `
                        <button class="btn btn-primary btn-sm" id="add-tramo-btn" style="border-radius: 50px;">+ Nuevo Tramo</button>
                    ` : ''}
                </div>
                <div class="table-wrap">
                    <table style="font-size: 11px;">
                        <thead>
                            <tr style="background: white;">
                                 <th>ID</th>
                                 <th>INICIO</th>
                                <th>FIN</th>
                                <th class="text-right">SALARIO</th>
                                <th class="text-right">BASE REAL</th>
                                <th>PROYECTO</th>
                                <th>RUBRO</th>
                                <th>FUENTE</th>
                                <th>COMPONENTE</th>
                                <th>RESPONSABLE</th>
                                <th class="text-right">ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                             ${tramos.map(t => {
                // --- GLOBAL WINDOW & PERIOD LOCK ---
                const isAdmin = auth.isAdmin();
                const isFinanciero = auth._user?.role === 'financiero';
                const now = new Date();
                const isWindowOpen = now.getDate() <= 6; // Only days 1-6

                const tDate = new Date(t.fecha_fin);
                const currentPeriod = now.getFullYear() * 12 + now.getMonth();
                const tramoPeriod = tDate.getFullYear() * 12 + tDate.getMonth();

                // Logic:
                // 1. Admin: Has absolute access (can edit past, current and future anytime).
                // 2. Financiero: Can only manage (create/edit/delete) if the window is open AND the tramo is current or future.
                // 3. Past tramos: Inmutable for non-admins always.
                const canManage = isAdmin || (isFinanciero && isWindowOpen);
                const isPast = tramoPeriod < currentPeriod;

                const canEdit = (canManage && !isPast) || isAdmin;
                const canDelete = (canManage && !isPast);
                const canDuplicate = canManage;

                return `
                                <tr>
                                     <td style="font-family: monospace; font-size: 10px; color: var(--text-muted);">${t.id_financiacion}</td>
                                     <td>${this.formatDate(t.fecha_inicio)}</td>
                                    <td>${this.formatDate(t.fecha_fin)}</td>
                                    <td class="text-right" style="font-weight: 700;">${this.money(t.salario_base)}</td>
                                    <td class="text-right" style="font-weight: 700; color: var(--primary);">${this.money(t.salario_t)}</td>
                                    <td>
                                        ${getName('proyectos', t.id_proyecto)}
                                        ${(pendingRequests || []).some(pr => String(pr.id_financiacion_afectado) === String(t.id_financiacion)) ? `
                                            <div style="background: #FFFBEB; color: #92400E; font-size: 9px; padding: 2px 6px; border-radius: 4px; border: 1px solid #FDE68A; margin-top: 4px; font-weight: 700; display: inline-block;">
                                                ⚠️ Pendiente Cambio
                                            </div>
                                        ` : ''}
                                    </td>
                                    <td>${t.rubro || '-'}</td>
                                    <td>${getName('fuentes', t.id_fuente)}</td>
                                    <td>${getName('componentes', t.id_componente)}</td>
                                    <td>${getName('responsables', t.id_responsable)}</td>
                                    <td class="text-right">
                                        ${canEdit ? `
                                            <button class="btn btn-ghost btn-sm edit-tramo-btn" data-json='${JSON.stringify(t)}' title="Editar">✏️</button>
                                        ` : ''}
                                        ${canDuplicate ? `
                                            <button class="btn btn-ghost btn-sm duplicate-tramo-btn" data-json='${JSON.stringify(t)}' title="Duplicar">👯</button>
                                        ` : ''}
                                        ${canDelete ? `
                                            <button class="btn btn-ghost btn-sm delete-tramo-btn" data-id="${t.id_financiacion}" style="color: var(--danger);" title="Eliminar">🗑️</button>
                                        ` : ''}
                                    </td>
                                </tr >
    `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 4.5 SOLICITUDES PENDIENTES DE ESTE EMPLEADO -->
            ${pendingRequests && pendingRequests.length > 0 ? `
            <div class="luxury-card mb-4" style="border: 1px dashed #F59E0B; background: #FFFBEB;">
                 <div class="flex align-center gap-2 mb-4" style="color: #92400E;">
                    <span style="font-size: 16px;">⏳</span><strong style="font-size: 12px; text-transform: uppercase;">Solicitudes de Cambio Pendientes</strong>
                </div>
                <div class="table-wrap">
                    <table style="font-size: 11px; width: 100%;">
                        <thead>
                            <tr style="background: rgba(245, 158, 11, 0.05);">
                                <th>TIPO</th>
                                <th>REF / ID</th>
                                <th>SOLICITANTE</th>
                                <th>FECHA</th>
                                <th>JUSTIFICACIÓN</th>
                                <th>ESTADO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pendingRequests.map(pr => `
                                <tr>
                                    <td>
                                        <span style="padding: 2px 6px; border-radius: 4px; font-weight: 800; font-size: 9px; background: ${pr.tipo_solicitud === 'ELIMINACION' ? '#FEE2E2' : '#E0F2FE'}; color: ${pr.tipo_solicitud === 'ELIMINACION' ? '#991B1B' : '#075985'};">
                                            ${pr.tipo_solicitud}
                                        </span>
                                    </td>
                                    <td style="font-family: monospace;">${pr.id_financiacion_afectado}</td>
                                    <td>${pr.solicitante}</td>
                                    <td>${new Date(pr.fecha_solicitud).toLocaleString('es-CO')}</td>
                                    <td style="max-width: 250px; white-space: normal;">${pr.justificacion || '-'}</td>
                                    <td>
                                        <div style="background: white; border: 1px solid #F59E0B; color: #92400E; padding: 2px 8px; border-radius: 50px; font-size: 10px; font-weight: 700; display: inline-block;">
                                            En Revisión
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="font-size: 11px; color: #92400E; margin-top: 12px; font-style: italic;">
                    Nota: Los cambios en estos registros se verán reflejados en los tramos una vez la Dirección los apruebe.
                </div>
            </div>
            ` : ''}
            
            <div class="flex justify-between align-center mb-6" style="padding: 16px 8px 0 8px; border-top: 1px solid var(--border); margin-top: 24px;">
                <h2 style="font-size: 20px; font-weight: 800; color: var(--primary-dark); margin: 0; letter-spacing: -0.02em;">
                    Análisis de Costos e Inversión
                </h2>
                <div style="background: white; border: 1px solid #E2E8F0; padding: 6px 16px; border-radius: 14px; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    <span style="font-size: 11px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em;">Vigencia:</span>
                    <select id="worker-year-select" style="border: none; background: transparent; font-weight: 800; color: var(--primary); outline: none; cursor: pointer; font-size: 14px;">
                        ${(availableYears || [new Date().getFullYear()]).map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>${y}</option>`).join('')}
                    </select>
                </div>
            </div>

            <!-- 5. RESUMEN DE FINANCIACIÓN POR PROYECTO -->
            <div class="luxury-card">
                 <div class="flex align-center gap-2 mb-6" style="color: var(--primary);">
                    <span style="font-size: 16px;">📈</span><strong style="font-size: 12px; text-transform: uppercase;">Resumen por Proyecto (Vigencia ${selectedYear})</strong>
                </div>
                <div class="table-wrap" style="background: transparent; border: none;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); border-bottom: 2px solid var(--border);">
                                <th style="text-align: left; padding: 12px;">Proyecto / Componente</th>
                                <th style="text-align: right; padding: 12px;">Total Financiado</th>
                            </tr>
                        </thead>
                        <tbody>
            ${(() => {
                // Priority: Use Backend Pre-Aggregated Data (V2)
                if (data.resumen_proyectos_v2 && data.resumen_proyectos_v2.length > 0) {
                    return data.resumen_proyectos_v2.map(rp => `
                        <tr style="border-bottom: 1px solid var(--border); background: #f1f5f9;">
                            <td style="padding: 16px 12px; color: var(--bosque-900); display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 16px;">📂</span>
                                <span style="font-weight: 700; font-family: 'Outfit', sans-serif;">${rp.nombre}</span>
                            </td>
                            <td style="padding: 16px 12px; text-align: right;">
                                <div style="font-weight: 800; color: var(--bosque-700); font-size: 14px; font-variant-numeric: tabular-nums;">${this.money(rp.total)}</div>
                            </td>
                        </tr>
                        ${rp.componentes.map(comp => `
                            <tr style="border-bottom: 1px solid var(--border); background: white;">
                                <td style="padding: 10px 12px 10px 42px; font-size: 13px; color: var(--text-soft); display: flex; align-items: center; gap: 8px;">
                                    <span style="display: block; width: 4px; height: 4px; border-radius: 50%; background: var(--bosque-500);"></span>
                                    ${comp.nombre}
                                </td>
                                <td style="padding: 10px 12px; text-align: right; font-size: 13px; font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums; color: var(--text-main);">
                                    ${this.money(comp.total)}
                                </td>
                            </tr>
                        `).join('')}
                    `).join('');
                }

                // Fallback: Legacy Client-Side Aggregation
                const projectAggregation = {};
                months.forEach(m => {
                    m.detalle.forEach(d => {
                        const pid = d.proyecto;
                        if (!projectAggregation[pid]) projectAggregation[pid] = 0;
                        projectAggregation[pid] += d.valor;
                    });
                });
                return Object.entries(projectAggregation)
                    .sort((a, b) => b[1] - a[1])
                    .map(([pid, total]) => `
                                    <tr style="border-bottom: 1px solid var(--border); background: white;">
                                        <td style="padding: 16px 12px; font-weight: 700; color: var(--primary-dark);">${getName('proyectos', pid)}</td>
                                        <td style="padding: 16px 12px; text-align: right;">
                                            <div style="font-weight: 900; color: var(--primary); font-size: 14px;">${this.money(total)}</div>
                                            <div style="font-size: 10px; color: var(--text-muted);">Acumulado en proyección</div>
                                        </td>
                                    </tr>
                                `).join('');
            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 6. MENSUALIZADO (Symmetric Table) -->
             <div class="luxury-card">
                 <div class="flex align-center gap-2 mb-6" style="color: var(--primary);">
                    <span style="font-size: 16px;">📅</span><strong style="font-size: 12px; text-transform: uppercase;">Vista Mensualizada ${selectedYear}</strong>
                </div>
                <div class="table-wrap" style="background: transparent; border: none; overflow: visible;">
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0 16px;">
                        <thead>
                            <tr style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); opacity: 0.8; letter-spacing: 0.05em;">
                                <th style="text-align: left; padding: 0 24px; width: 30%; background: transparent; border: none;">MES / VIGENCIA</th>
                                <th style="text-align: center; padding: 0 24px; width: 40%; background: transparent; border: none;">CARGA SALARIAL TOTAL</th>
                                <th style="text-align: center; padding: 0 24px; width: 30%; background: transparent; border: none;">ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${months.map(m => {
                const [year, month] = m.anioMes.split('-');
                const monthName = new Date(year, parseInt(month) - 1).toLocaleString('es-CO', { month: 'long' });
                const capMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

                return `
                                <tr style="background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-radius: 12px; transition: transform 0.2s;">
                                    <td style="padding: 24px; border-radius: 12px 0 0 12px; vertical-align: middle; border: 1px solid var(--border); border-right: none;">
                                        <div class="flex align-center gap-2">
                                            <div style="background: rgba(0,77,103,0.05); color: var(--primary); font-weight: 800; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 14px;">${month}</div>
                                            <div>
                                                <div style="font-weight: 800; font-size: 15px; color: var(--primary-dark);">${capMonth}</div>
                                                <div style="font-size: 12px; color: var(--text-muted); font-weight: 500;">Año ${year}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="text-center" style="padding: 24px; vertical-align: middle; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: white;">
                                        <div style="font-weight: 900; color: var(--primary); font-size: 18px; letter-spacing: -0.5px;">${this.money(m.total)}</div>
                                    </td>
                                    <td class="text-center" style="padding: 24px; border-radius: 0 12px 12px 0; vertical-align: middle; border: 1px solid var(--border); border-left: none;">
                                        <div class="flex gap-3 justify-center align-center">
                                            <div onclick="window.showProjectDetails('${m.anioMes}')" class="btn btn-ghost" style="cursor: pointer; padding: 8px 16px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); background: #F9FAFB;">
                                                <span>🔍</span> <span style="font-weight: 600;">Proyectos</span>
                                            </div>
                                            <button onclick="window.showLiquidacion('${m.anioMes}')" class="btn btn-primary" style="padding: 8px 16px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px rgba(0,77,103,0.2);">
                                                <span>📄</span> <span>Liquidación</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                `;
            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Bind Year Select
        const yearSelect = document.getElementById('worker-year-select');
        if (yearSelect) {
            yearSelect.onchange = (e) => {
                import('./modules/individual.js').then(m => {
                    m.individual.selectedYear = parseInt(e.target.value);
                    m.individual.search(empleado.cedula);
                });
            };
        }
    },

    renderLiquidacionModal(monthData, catalogs) {
        const m = monthData;
        const [year, month] = m.anioMes.split('-');
        const monthName = new Date(year, parseInt(month) - 1).toLocaleString('es-CO', { month: 'long' });
        const capMonth = `${year} ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;

        // Helper to resolve Project Name
        const getName = (listName, id) => {
            if (!catalogs || !catalogs[listName]) return id || '-';
            const item = catalogs[listName].find(x => String(x.id) === String(id));
            if (!item) return id || '-';
            return item.nombre || item.id || '-';
        };

        let html = `<div style="background: #F9FAFB; padding: 24px; border-radius: 12px;">`;

        m.detalle.forEach(d => {
            const c = d.conceptos;
            // Sums
            const totalSal = (c.salario_mes || 0) + (c.aux_transporte || 0) + (c.dotacion || 0);
            const totalPres = (c.primas || 0) + (c.cesantias || 0) + (c.i_cesantias || 0) + (c.sueldo_vacaciones || 0) + (c.prima_vacaciones || 0);
            const totalSS = (c.salud || 0) + (c.pension || 0) + (c.arl || 0);
            const totalPara = (c.ccf || 0) + (c.sena || 0) + (c.icbf || 0);

            // Helper for Concept Cards
            const card = (title, icon, content, totalName, totalVal, colorClass) => `
                <div style="background: white; border-radius: 12px; padding: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); border: 1px solid var(--border); display: flex; flex-direction: column;">
                    <div style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 14px;">${icon}</span> ${title}
                    </div>
                    <div style="flex: 1;">
                        ${content}
                    </div>
                    <div class="flex justify-between mt-3 pt-3 border-top" style="font-weight: 700; font-size: 13px; color: var(--${colorClass || 'text'});">
                        <span>${totalName}</span><span>${this.money(totalVal)}</span>
                    </div>
                </div>
            `;

            // Resolve Project Name
            const projName = getName('proyectos', d.id_proyecto || d.proyecto);

            html += `
                <div style="margin-bottom: 32px;">
                    <div class="flex justify-between mb-4 pb-2 border-bottom">
                         <div>
                            <strong style="color: var(--primary-dark); font-size: 16px; display: block;">${projName}</strong>
                            <span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">${d.dias} días liquidados</span>
                        </div>
                        <strong style="font-size: 20px; color: var(--primary);">${this.money(d.valor)}</strong>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                        
                        <!-- CARD 1: SALARIO -->
                        ${card('Salario & Base', '💰', `
                            ${this.row('Sueldo', c.salario_mes)}
                            ${this.row('Aux. Transporte', c.aux_transporte)}
                            ${this.row('Dotación', c.dotacion)}
                        `, 'Total Salario', totalSal, 'primary')}

                        <!-- CARD 2: PRESTACIONES -->
                        ${card('Prestaciones Sociales', '🏖️', `
                            ${this.row('Primas', c.primas)}
                            ${this.row('Vacaciones (Sueldo)', c.sueldo_vacaciones)}
                            ${this.row('Vacaciones (Prima)', c.prima_vacaciones)}
                            ${this.row('Cesantías', c.cesantias)}
                            ${this.row('Int. Cesantías', c.i_cesantias)}
                        `, 'Total Prestaciones', totalPres, 'primary')}

                        <!-- CARD 3: SEGURIDAD SOCIAL -->
                        ${card('Seguridad Social', '🏥', `
                            ${this.row('Salud (Patrono)', c.salud)}
                            ${this.row('Pensión (Patrono)', c.pension)}
                            ${this.row('ARL', c.arl)}
                        `, 'Total SS', totalSS, 'text')}

                        <!-- CARD 4: PARAFISCALES -->
                        ${card('Parafiscales', '🏢', `
                            ${this.row('Caja Comp.', c.ccf)}
                            ${this.row('SENA', c.sena)}
                            ${this.row('ICBF', c.icbf)}
                        `, 'Total Parafiscales', totalPara, 'text')}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        this.openModal(`Liquidación Detallada · ${capMonth}`, html);
    },

    // Helper used by modals
    row(label, val) {
        return `<div class="flex justify-between mb-2" style="font-size: 13px;"><span class="text-muted">${label}</span><span style="font-weight: 600;">${this.money(val || 0)}</span></div>`;
    },

    renderProjectDetailsModal(monthData, catalogs) {
        const m = monthData;
        const [year, month] = m.anioMes.split('-');
        const monthName = new Date(year, parseInt(month) - 1).toLocaleString('es-CO', { month: 'long' });
        const capMonth = `${year} ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`;

        // Resolve Name Helper
        const getName = (listName, id) => {
            if (!catalogs || !catalogs[listName]) return id || '-';
            const item = catalogs[listName].find(x => String(x.id) === String(id));
            if (!item) return id || '-';
            return item.nombre || item.id || '-';
        };

        let html = `<div style="background: #F9FAFB; padding: 24px; border-radius: 12px;">`;

        m.detalle.forEach(d => {
            html += `
                <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 16px;">
                    <div class="flex justify-between mb-4 border-bottom pb-4">
                        <strong style="color: var(--primary-dark); font-size: 16px;">${getName('proyectos', d.id_proyecto)}</strong>
                         <strong style="font-size: 16px; color: var(--primary);">${this.money(d.valor)}</strong>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 8px; font-size: 13px; margin-bottom: 20px;">
                        <div class="text-muted" style="font-weight: 600;">Días:</div><div>${d.dias}</div>
                        <div class="text-muted" style="font-weight: 600;">Rubro:</div><div>${d.rubro || '-'}</div>
                        <div class="text-muted" style="font-weight: 600;">Fuente:</div><div>${getName('fuentes', d.fuente)}</div>
                        <div class="text-muted" style="font-weight: 600;">Componente:</div><div>${getName('componentes', d.componente)}</div>
                        <div class="text-muted" style="font-weight: 600;">Subcomponente:</div><div>${getName('subcomponentes', d.subcomponente)}</div>
                        <div class="text-muted" style="font-weight: 600;">Categoría:</div><div>${getName('categorias', d.categoria)}</div>
                        <div class="text-muted" style="font-weight: 600;">Responsable:</div><div>${getName('responsables', d.responsable)}</div>
                    </div>

                    <div style="background: rgba(0,77,103,0.05); padding: 12px; border-radius: 8px; font-size: 11px; display: flex; justify-content: space-between;">
                        <div>
                            <span style="font-weight: 700; color: var(--text-muted);">🗓️ TRAMO:</span> 
                            <span style="margin-left: 8px;">${d.fecha_inicio ? d.fecha_inicio.split('T')[0] : ''} - ${d.fecha_fin ? d.fecha_fin.split('T')[0] : ''}</span>
                        </div>
                        <div>
                             <span style="font-weight: 700; color: var(--text-muted);">💰 BASE MES:</span>
                             <span style="margin-left: 8px;">—</span>
                        </div>
                    </div>
                </div>
             `;
        });
        html += `</div>`;

        this.openModal(`${capMonth} · Detalle completo`, html);
    },

    // --- SEARCHABLE DROPDOWN COMPONENT ---
    /**
     * Renders the HTML structure for a searchable dropdown
     */
    renderSearchableSelect(id, label, options, currentValue) {
        const currentOption = options.find(o => String(o.id) === String(currentValue));
        const currentName = currentOption ? (currentOption.nombre || currentOption.id) : '-- Seleccione --';

        return `
            <div class="searchable-select" id="wrapper-${id}">
                <label class="muted" style="font-size: 11px;">${label}</label>
                <div class="select-trigger" id="trigger-${id}">
                    <span class="selected-text">${currentName}</span>
                    <span style="font-size: 10px; opacity: 0.5;">▼</span>
                </div>
                <div class="select-dropdown hidden" id="dropdown-${id}">
                    <input type="text" id="search-${id}" placeholder="Escriba palabra clave..." autocomplete="off">
                    <div class="select-options" id="options-${id}">
                        <div class="select-option" data-id="">-- Seleccione --</div>
                        ${options.map(o => {
            const val = String(o.id || '');
            const name = String(o.nombre || '');
            const display = (val && val !== name) ? `${val} - ${name}` : name;
            return `
                                <div class="select-option ${String(o.id) === String(currentValue) ? 'selected' : ''}" 
                                     data-id="${o.id}" 
                                     data-search="${(name + ' ' + val).toLowerCase()}">
                                    ${display}
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                <input type="hidden" id="${id}" value="${currentValue || ''}">
            </div>
        `;
    },

    /**
     * Initializes the behavior for a searchable dropdown
     */
    initSearchableSelect(id, onSelect) {
        const trigger = document.getElementById(`trigger-${id}`);
        const dropdown = document.getElementById(`dropdown-${id}`);
        const searchInput = document.getElementById(`search-${id}`);
        const optionsContainer = document.getElementById(`options-${id}`);
        const hiddenInput = document.getElementById(id);
        const selectedText = trigger.querySelector('.selected-text');

        // Toggle Dropdown
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = dropdown.classList.contains('hidden');

            // Close all other dropdowns
            document.querySelectorAll('.select-dropdown').forEach(d => d.classList.add('hidden'));
            document.querySelectorAll('.select-trigger').forEach(t => t.classList.remove('active'));

            if (isHidden) {
                dropdown.classList.remove('hidden');
                trigger.classList.add('active');
                searchInput.focus();
            }
        });

        // Global click to close
        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            trigger.classList.remove('active');
        });

        dropdown.addEventListener('click', (e) => e.stopPropagation());

        // Search Logic (KEYWORD SEARCH - Substring matching)
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const optionEls = optionsContainer.querySelectorAll('.select-option');

            optionEls.forEach(opt => {
                const searchData = opt.getAttribute('data-search') || '';
                // The magic: .includes() instead of .startsWith()
                if (searchData.includes(term) || opt.getAttribute('data-id') === "") {
                    opt.classList.remove('hidden');
                } else {
                    opt.classList.add('hidden');
                }
            });
        });

        // Select Logic
        optionsContainer.addEventListener('click', (e) => {
            const opt = e.target.closest('.select-option');
            if (!opt) return;

            const val = opt.getAttribute('data-id');
            const name = opt.textContent.trim();

            hiddenInput.value = val;
            selectedText.textContent = name;

            // Highlight selected
            optionsContainer.querySelectorAll('.select-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');

            dropdown.classList.add('hidden');
            trigger.classList.remove('active');

            if (onSelect) onSelect(val);
        });
    },

    /**
     * Renders a searchable MULTI-SELECT component
     */
    renderSearchableMultiSelect(id, label, options, placeholder = "Seleccionar...") {
        return `
            <div class="searchable-select searchable-multi" id="wrapper-${id}">
                ${label ? `<label class="muted" style="font-size: 11px;">${label}</label>` : ''}
                <div class="select-trigger" id="trigger-${id}">
                    <span class="selected-text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${placeholder}</span>
                    <span style="font-size: 10px; opacity: 0.5;">▼</span>
                </div>
                <div class="select-dropdown hidden" id="dropdown-${id}" style="width: 300px; max-width: 90vw;">
                    <div style="padding: 8px; border-bottom: 1px solid #eee; display: flex; gap: 8px; margin-bottom: 4px;">
                        <button class="btn btn-sm btn-ghost select-all-btn" style="font-size: 10px; flex: 1;">Todos</button>
                        <button class="btn btn-sm btn-ghost select-none-btn" style="font-size: 10px; flex: 1;">Ninguno</button>
                    </div>
                    <input type="text" id="search-${id}" placeholder="Buscar palabra clave..." autocomplete="off">
                    <div class="select-options" id="options-${id}">
                        ${options.map(opt => {
            const val = typeof opt === 'object' ? opt.id || opt.value : opt;
            const lbl = typeof opt === 'object' ? opt.nombre || opt.label : opt;
            const display = (val && String(val) !== String(lbl)) ? `${val} - ${lbl}` : lbl;
            return `
                                <label class="select-option" style="display: flex; align-items: center; gap: 10px; cursor: pointer; margin: 0;">
                                    <input type="checkbox" class="ms-check" value="${val}" style="width: 14px; height: 14px; margin: 0;">
                                    <span class="opt-label" data-search="${(String(lbl) + ' ' + String(val)).toLowerCase()}">${display}</span>
                                </label>
                            `;
        }).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Initializes a searchable MULTI-SELECT component
     */
    initSearchableMultiSelect(id, onChange, placeholder = "Seleccionar...") {
        const trigger = document.getElementById(`trigger-${id}`);
        const dropdown = document.getElementById(`dropdown-${id}`);
        const searchInput = document.getElementById(`search-${id}`);
        const optionsContainer = document.getElementById(`options-${id}`);
        const selectedText = trigger.querySelector('.selected-text');
        const checks = optionsContainer.querySelectorAll('.ms-check');

        const updateLabel = () => {
            const selected = [...optionsContainer.querySelectorAll('.ms-check:checked')];
            if (selected.length === 0) selectedText.textContent = placeholder;
            else if (selected.length === 1) {
                const optLabel = selected[0].closest('label').querySelector('.opt-label').textContent.trim();
                selectedText.textContent = optLabel;
            } else {
                selectedText.textContent = `${selected.length} seleccionados`;
            }
            if (onChange) onChange();
        };

        // Toggle
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = dropdown.classList.contains('hidden');
            document.querySelectorAll('.select-dropdown').forEach(d => d.classList.add('hidden'));
            if (isHidden) {
                dropdown.classList.remove('hidden');
                trigger.classList.add('active');
                searchInput.focus();
            }
        });

        document.addEventListener('click', () => {
            dropdown.classList.add('hidden');
            trigger.classList.remove('active');
        });

        dropdown.addEventListener('click', (e) => e.stopPropagation());

        // Keywork search logic
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const labels = optionsContainer.querySelectorAll('label.select-option');
            labels.forEach(lbl => {
                const searchData = lbl.querySelector('.opt-label').getAttribute('data-search') || '';
                if (searchData.includes(term)) lbl.classList.remove('hidden');
                else lbl.classList.add('hidden');
            });
        });

        // Toggle All / None
        dropdown.querySelector('.select-all-btn').onclick = () => {
            checks.forEach(c => {
                const lbl = c.closest('label');
                if (!lbl.classList.contains('hidden')) c.checked = true;
            });
            updateLabel();
        };
        dropdown.querySelector('.select-none-btn').onclick = () => {
            checks.forEach(c => {
                const lbl = c.closest('label');
                if (!lbl.classList.contains('hidden')) c.checked = false;
            });
            updateLabel();
        };

        checks.forEach(c => c.onchange = updateLabel);
    }
};

function abs(n) { return Math.abs(n); }
