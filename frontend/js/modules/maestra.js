/**
 * maestra.js - Master Table Module (Premium Master-Detail UI)
 * Revisado: sistema de pestañas (Tabs) para evitar scroll vertical.
 */

import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';

export const maestra = {
    table: null,
    currentRecord: null,
    catalogos: {},          // { fieldName: { codigo: nombre } }
    _catalogosLoaded: false, // Flag para no recargar en cada refresh

    async load() {
        if (!auth.isAdmin()) {
            ui.showToast("Acceso denegado: módulo exclusivo para administradores", "error");
            window.location.hash = '#/home';
            return;
        }
        if (!this._catalogosLoaded) {
            await this.fetchCatalogos();
        }
        await this.render();
    },

    async fetchCatalogos() {
        try {
            const res = await api.get('/admin/maestra/catalogos-nombres');
            if (res?.ok) {
                this.catalogos = res.catalogos;
                this._catalogosLoaded = true;
            }
        } catch (e) {
            console.warn("[Maestra] Error al cargar catálogos:", e);
        }
    },

    async render() {
        const container = document.getElementById('admin-module-container');
        if (!container) return;

        container.innerHTML = `
            <div class="fade-in">
                <!-- Navigation & Header -->
                <div class="flex justify-between align-center mb-6">
                    <div class="flex align-center gap-4">
                        <button id="btn-back-admin" class="btn btn-ghost" style="padding: 8px; border-radius: 10px; border: 1px solid var(--border); font-size: 18px;">⬅️</button>
                        <div>
                            <h2 style="font-size: 24px; font-weight: 900; color: var(--primary-dark); margin: 0; letter-spacing: -0.02em;">
                                🛠️ Centro de Control de Financiación
                            </h2>
                            <p style="color: #64748B; margin-top: 4px; font-size: 14px; font-weight: 500;">
                                Edición de alta precisión · Sin desplazamientos verticales
                            </p>
                        </div>
                    </div>
                    <div class="flex gap-3">
                        <button id="btn-add-maestra" class="btn btn-primary" style="background: var(--accent); border-radius: 12px; padding: 10px 24px;">
                            + Nuevo
                        </button>
                        <button id="btn-refresh-maestra" class="btn btn-ghost" style="border: 1px solid var(--border); border-radius: 12px;">
                            🔄 Actualizar
                        </button>
                    </div>
                </div>

                <div class="maestra-container">
                    <div class="maestra-master">
                        <div style="padding: 16px; background: #fff; border-bottom: 1px solid var(--border); display: flex; gap: 16px; align-items: center;">
                            <div style="flex: 1; position: relative;">
                                <span style="position: absolute; left: 12px; top: 10px; opacity: 0.5;">🔍</span>
                                <input type="text" id="maestra-search" placeholder="Buscar cédula, nombre o proyecto..." 
                                    style="width: 100%; padding-left: 36px; height: 40px; border-radius: 10px; border: 1px solid #E2E8F0;">
                            </div>
                            <button id="btn-download-maestra" class="btn btn-ghost btn-sm" style="border: 1px solid var(--border);">📥 Exportar</button>
                        </div>
                        <div id="maestra-table-container" class="tabulator-maestra" style="flex: 1;"></div>
                    </div>

                    <!-- DETAIL DRAWER WITH TABS -->
                    <div id="maestra-drawer" class="maestra-drawer">
                        <div class="drawer-header" style="padding-bottom: 12px; border-bottom: none;">
                            <div>
                                <h3 id="drawer-title" style="font-size: 17px; font-weight: 800; margin: 0;">Detalle</h3>
                                <div id="drawer-subtitle" class="id-badge" style="margin-top: 4px;">—</div>
                            </div>
                            <button id="btn-close-drawer" class="btn btn-ghost" style="padding: 4px; font-size: 18px;">✕</button>
                        </div>

                        <!-- NEW: Tab Navigation -->
                        <div class="drawer-tabs">
                            <button class="tab-btn active" data-tab="tab-contrato">📄 Contrato</button>
                            <button class="tab-btn" data-tab="tab-finanzas">💰 Finanzas</button>
                            <button class="tab-btn" data-tab="tab-notas">📝 Notas</button>
                        </div>
                        
                        <div class="drawer-content" style="padding-top: 0;">
                            <form id="maestra-form">
                                <!-- TAB 1: CONTRATO -->
                                <div id="tab-contrato" class="form-tab-content active">
                                    <div class="form-section">
                                        <div class="form-section-title">👤 Identificación</div>
                                        <div class="form-grid">
                                            <div class="form-group">
                                                <label>Cédula</label>
                                                <input type="text" name="cedula" required>
                                            </div>
                                            <div class="form-group">
                                                <label>ID Contrato</label>
                                                <input type="text" name="id_contrato" required>
                                            </div>
                                            <div class="form-group full">
                                                <label>Posición / Cargo</label>
                                                <input type="text" name="posicion">
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-section">
                                        <div class="form-section-title">📅 Periodo</div>
                                        <div class="form-grid">
                                            <div class="form-group">
                                                <label>Fecha Inicio</label>
                                                <input type="date" name="fecha_inicio" required>
                                            </div>
                                            <div class="form-group">
                                                <label>Fecha Fin</label>
                                                <input type="date" name="fecha_fin" required>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- TAB 2: FINANZAS -->
                                <div id="tab-finanzas" class="form-tab-content">
                                    <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
                                        <div class="form-group">
                                            <label>Salario Base</label>
                                            <input type="number" name="salario_base" required>
                                        </div>
                                        <div class="form-group">
                                            <label>Salario Total</label>
                                            <input type="number" name="salario_t">
                                        </div>
                                        <div class="form-group">
                                            <label>Proyecto</label>
                                            <input type="text" name="id_proyecto" required>
                                            <div class="id-hint" id="hint-id_proyecto"></div>
                                        </div>
                                        <div class="form-group">
                                            <label>Fuente</label>
                                            <input type="text" name="id_fuente">
                                            <div class="id-hint" id="hint-id_fuente"></div>
                                        </div>
                                        <div class="form-group">
                                            <label>Rubro</label>
                                            <input type="text" name="rubro">
                                        </div>
                                        <div class="form-group">
                                            <label>Componente</label>
                                            <input type="text" name="id_componente">
                                            <div class="id-hint" id="hint-id_componente"></div>
                                        </div>
                                        <div class="form-group">
                                            <label>Subcomponente</label>
                                            <input type="text" name="id_subcomponente">
                                            <div class="id-hint" id="hint-id_subcomponente"></div>
                                        </div>
                                        <div class="form-group">
                                            <label>Categoría</label>
                                            <input type="text" name="id_categoria">
                                            <div class="id-hint" id="hint-id_categoria"></div>
                                        </div>
                                        <div class="form-group full">
                                            <label>Responsable</label>
                                            <input type="text" name="id_responsable">
                                            <div class="id-hint" id="hint-id_responsable"></div>
                                        </div>
                                    </div>
                                </div>

                                <!-- TAB 3: NOTAS -->
                                <div id="tab-notas" class="form-tab-content">
                                    <div class="form-section">
                                        <div class="form-section-title">📄 Historial y Auditoría</div>
                                        <div class="form-group full">
                                            <label>Justificación del Cambio</label>
                                            <textarea name="justificacion" rows="4"></textarea>
                                        </div>
                                    </div>
                                    <div id="drawer-audit" style="padding: 16px; background: #F8FAFC; border-radius: 12px; font-size: 11px; color: #64748B; border: 1px solid #E2E8F0;">
                                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                                            <span>Última modificación:</span>
                                            <strong id="audit-date">—</strong>
                                        </div>
                                        <div style="display: flex; justify-content: space-between;">
                                            <span>Realizada por:</span>
                                            <strong id="audit-user">—</strong>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div class="drawer-footer">
                            <button id="btn-save-drawer" class="btn btn-primary" style="flex: 1; height: 44px; border-radius: 12px;">✅ Guardar Cambios</button>
                            <button id="btn-delete-record" class="btn btn-ghost" style="color: #EF4444; border: 1px solid #FECACA; padding: 0 16px; border-radius: 12px;">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await this.initTable();
        this.bindEvents();
    },

    async initTable() {
        if (this.table) {
            this.table.destroy();
            this.table = null;
        }

        try {
            ui.showLoading("Cargando base maestra...");
            const data = await api.get('/admin/maestra/financiacion');
            ui.hideLoading();

            this.table = new Tabulator("#maestra-table-container", {
                data: data,
                layout: "fitColumns",
                responsiveLayout: false,
                pagination: "local",
                paginationSize: 50,
                initialSort: [{ column: "fecha_modificacion", dir: "desc" }],
                selectable: 1,
                columns: [
                    {
                        title: "", width: 50, hozAlign: "center", headerSort: false,
                        formatter: () => `<button style="background: var(--primary-lighter); border: none; padding: 4px 8px; border-radius: 6px; cursor: pointer; color: var(--primary-dark); font-weight: 800;">📝</button>`,
                        cellClick: (e, cell) => this.showDetail(cell.getRow().getData())
                    },
                    { title: "ID", field: "id_financiacion", width: 100 },
                    { title: "Cédula", field: "cedula", width: 110, headerFilter: "input" },
                    { title: "Nombre", field: "nombre_completo", minWidth: 200, headerFilter: "input" },
                    {
                        title: "Proyecto", field: "id_proyecto", width: 140, headerFilter: "input",
                        formatter: (cell) => `<span class="id-badge" title="${this.catalogos.id_proyecto?.[cell.getValue()] || ''}">${cell.getValue()}</span>`
                    },
                    {
                        title: "Salario Base", field: "salario_base", width: 130, hozAlign: "right",
                        formatter: "money", formatterParams: { symbol: "$", precision: 0, thousand: "." }
                    },
                    {
                        title: "Referencia", field: "pago_proyectado", width: 130, hozAlign: "right",
                        formatter: (cell) => `<span class="pago-proy-badge">$${Number(cell.getValue()).toLocaleString()}</span>`
                    },
                    { title: "Modificado", field: "fecha_modificacion", visible: false }
                ],
                rowClick: (e, row) => this.showDetail(row.getData())
            });
        } catch (e) {
            ui.hideLoading();
            ui.showToast("Error al conectar con la base de datos", "error");
        }
    },

    async showDetail(data) {
        this.currentRecord = data;
        const drawer = document.getElementById('maestra-drawer');
        if (!drawer) return;

        drawer.classList.add('open');
        this.switchTab('tab-contrato'); // Default tab when opening

        document.getElementById('drawer-title').textContent = data.nombre_completo || 'Nuevo Registro';
        document.getElementById('drawer-subtitle').textContent = data.id_financiacion || 'IHFIN_PENDIENTE';

        document.getElementById('audit-date').textContent = data.fecha_modificacion ? new Date(data.fecha_modificacion).toLocaleString('es-CO') : '—';
        document.getElementById('audit-user').textContent = data.modifico || '—';

        const form = document.getElementById('maestra-form');
        form.querySelectorAll('input, textarea').forEach(input => {
            const val = data[input.name];
            input.value = (val !== undefined && val !== null) ? val : '';
            this.updateHint(input.name, input.value);
        });
    },

    switchTab(tabId) {
        // Toggle Buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        // Toggle Sections
        document.querySelectorAll('.form-tab-content').forEach(section => {
            section.classList.toggle('active', section.id === tabId);
        });
    },

    updateHint(name, value) {
        const hintEl = document.getElementById(`hint-${name}`);
        if (!hintEl) return;

        const dictionary = this.catalogos[name];
        if (dictionary && value && dictionary[value]) {
            hintEl.textContent = `↳ ${dictionary[value]}`;
            hintEl.style.color = "var(--primary)";
            hintEl.style.fontWeight = "600";
        } else if (dictionary && value) {
            hintEl.textContent = "↳ Código no reconocido";
            hintEl.style.color = "#94A3B8";
        } else {
            hintEl.textContent = "";
        }
    },

    closeDetail() {
        const drawer = document.getElementById('maestra-drawer');
        if (drawer) drawer.classList.remove('open');
        this.table?.deselectRow();
        this.currentRecord = null;
    },

    async saveRecord() {
        if (!this.currentRecord) return;
        const form = document.getElementById('maestra-form');
        const updatedData = {};
        new FormData(form).forEach((v, k) => { updatedData[k] = v; });

        updatedData.salario_base = parseFloat(updatedData.salario_base) || 0;
        if (updatedData.salario_t) updatedData.salario_t = parseFloat(updatedData.salario_t) || 0;

        try {
            ui.showLoading("Guardando cambios...");
            const res = await api.put(`/admin/maestra/financiacion/${this.currentRecord.id_financiacion}`, updatedData);
            ui.hideLoading();

            if (res && res.ok) {
                ui.showToast("Registro actualizado correctamente", "success");
                await this.initTable();
                this.closeDetail();
            } else {
                ui.showToast(res?.message || "Error al guardar los cambios", "error");
            }
        } catch (e) {
            ui.hideLoading();
            ui.showToast(e.message || "Error de conexión", "error");
        }
    },

    bindEvents() {
        document.getElementById('btn-close-drawer')?.addEventListener('click', () => this.closeDetail());
        document.getElementById('btn-save-drawer')?.addEventListener('click', () => this.saveRecord());
        document.getElementById('btn-refresh-maestra')?.addEventListener('click', () => this.load());
        document.getElementById('btn-back-admin')?.addEventListener('click', () => {
            import('./admin.js').then(m => m.admin.switchTab('home'));
        });

        // Tab switching events
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Search trigger
        document.getElementById('maestra-search')?.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (!val) {
                this.table?.clearFilter();
            } else {
                this.table?.setFilter([
                    [{ field: "cedula", type: "like", value: val },
                    { field: "id_proyecto", type: "like", value: val },
                    { field: "nombre_completo", type: "like", value: val }]
                ]);
            }
        });

        // Live hints
        const hintFields = ['id_proyecto', 'id_fuente', 'id_componente', 'id_subcomponente', 'id_responsable', 'id_categoria'];
        hintFields.forEach(name => {
            document.querySelector(`[name="${name}"]`)?.addEventListener('input', (e) => this.updateHint(name, e.target.value.trim()));
        });

        document.getElementById('btn-delete-record')?.addEventListener('click', () => {
            if (!this.currentRecord) return;
            const id = this.currentRecord.id_financiacion;
            ui.confirm('Eliminar Tramo', `¿Eliminar permanentemente el registro ${id}?`, async () => {
                try {
                    ui.showLoading("Eliminando...");
                    const res = await api.delete(`/admin/maestra/financiacion/${id}`);
                    ui.hideLoading();
                    if (res.ok) {
                        ui.showToast("Eliminado con éxito", "info");
                        await this.initTable();
                        this.closeDetail();
                    }
                } catch (e) {
                    ui.hideLoading();
                    ui.showToast("Error al procesar la solicitud", "error");
                }
            });
        });

        document.getElementById('btn-add-maestra')?.addEventListener('click', () => this.addNew());
        document.getElementById('btn-download-maestra')?.addEventListener('click', () => {
            this.table?.download("xlsx", "BFinanciacion_Export.xlsx", { sheetName: "Datos" });
        });
    },

    async addNew() {
        try {
            ui.showLoading("Creando borrador...");
            const res = await api.post('/admin/maestra/financiacion', {
                cedula: "0", id_contrato: "NUEVO", id_proyecto: "PENDIENTE",
                fecha_inicio: new Date().toISOString().split('T')[0],
                fecha_fin: `${new Date().getFullYear()}-12-31`, salario_base: 0
            });
            ui.hideLoading();
            if (res.id) {
                ui.showToast("Borrador generado", "success");
                await this.initTable();
                const fresh = this.table.getData().find(d => d.id_financiacion === res.id);
                if (fresh) this.showDetail(fresh);
            }
        } catch (e) {
            ui.hideLoading();
            ui.showToast("Error al crear registro", "error");
        }
    }
};
