/**
 * maestra.js - Master Table Module (Direct BFinanciacion Editing)
 */

import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';

export const maestra = {
    table: null,

    async load() {
        if (!auth.isAdmin()) {
            ui.showToast("No tiene permisos para acceder a esta sección", "error");
            window.location.hash = '#/home';
            return;
        }
        await this.render();
    },

    async render() {
        const container = document.getElementById('admin-module-container');
        if (!container) return;

        container.innerHTML = `
            <div class="fade-in">
                <div class="flex justify-between align-center mb-6">
                    <div>
                        <h2 style="font-size: 20px; font-weight: 800; color: #1E293B; margin: 0;">Tabla Maestra: Financiación</h2>
                        <p style="color: #64748B; margin-top: 4px; font-size: 14px;">Edición directa y masiva de tramos de personal proyectado.</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="btn-add-maestra" class="btn btn-primary" style="background: #10B981;">+ Nuevo Registro</button>
                        <button id="btn-refresh-maestra" class="btn btn-secondary">🔄 Actualizar</button>
                    </div>
                </div>

                <div class="luxury-card" style="padding: 0; overflow: hidden; border: 1px solid #E2E8F0;">
                    <div id="maestra-toolbar" style="padding: 12px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; display: flex; gap: 12px; align-items: center;">
                        <input type="text" id="maestra-search" placeholder="🔍 Buscar por cédula, proyecto o nombre..." 
                            style="flex: 1; padding: 8px 12px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 13px;">
                        <button id="btn-download-maestra" class="btn btn-ghost" style="font-size: 12px;">📥 Exportar XLSX</button>
                    </div>
                    <div id="maestra-table-container" style="height: 65vh;"></div>
                </div>
                
                <div style="margin-top: 16px; background: #FEF2F2; border: 1px solid #FECACA; padding: 12px; border-radius: 12px; display: flex; gap: 12px; align-items: center;">
                    <span style="font-size: 18px;">⚠️</span>
                    <p style="margin: 0; color: #991B1B; font-size: 12px; font-weight: 600;">
                        Atención: Los cambios realizados aquí impactan directamente la base de datos de producción y se registran en la bitácora de auditoría.
                    </p>
                </div>
            </div>
        `;

        this.initTable();
        this.bindEvents();
    },

    async initTable() {
        const data = await api.get('/admin/maestra/financiacion');

        this.table = new Tabulator("#maestra-table-container", {
            data: data,
            layout: "fitColumns",
            responsiveLayout: "hide",
            history: true,
            pagination: "local",
            paginationSize: 50,
            paginationSizeSelector: [50, 100, 200, 500],
            movableColumns: true,
            resizableRows: true,
            initialSort: [{ column: "fecha_modificacion", dir: "desc" }],
            columns: [
                { title: "ID", field: "id_financiacion", width: 100, headerFilter: "input" },
                { title: "Cédula", field: "cedula", width: 100, editor: "input", headerFilter: "input" },
                { title: "Nombre", field: "nombre_completo", width: 200, headerFilter: "input", color: "#64748B" },
                { title: "Proyecto", field: "id_proyecto", width: 120, editor: "input", headerFilter: "input" },
                { title: "Contrato", field: "id_contrato", width: 120, editor: "input" },
                { title: "Cargo Pos.", field: "cargo_posicion", width: 150, color: "#64748B" },
                { title: "Inicio", field: "fecha_inicio", width: 110, editor: "date", sorter: "date" },
                { title: "Fin", field: "fecha_fin", width: 110, editor: "date", sorter: "date" },
                {
                    title: "Salario Base", field: "salario_base", width: 130, editor: "number",
                    formatter: "money", formatterParams: { symbol: "$", precision: 0 },
                    hozAlign: "right"
                },
                { title: "Rubro", field: "rubro", width: 100, editor: "input" },
                { title: "Fuente", field: "id_fuente", width: 100, editor: "input" },
                { title: "Comp.", field: "id_componente", width: 80, editor: "input" },
                { title: "Subc.", field: "id_subcomponente", width: 80, editor: "input" },
                { title: "Cat.", field: "id_categoria", width: 80, editor: "input" },
                { title: "Resp.", field: "id_responsable", width: 80, editor: "input" },
                {
                    title: "Acciones", width: 80, hozAlign: "center", headerSort: false,
                    formatter: () => `<button class="btn-delete-row" style="background: none; border: none; cursor: pointer; color: #EF4444; font-size: 16px;">🗑️</button>`,
                    cellClick: (e, cell) => this.deleteRow(cell.getRow())
                }
            ],
            cellEdited: async (cell) => {
                const rowData = cell.getRow().getData();
                try {
                    const res = await api.put(`/admin/maestra/financiacion/${rowData.id_financiacion}`, rowData);
                    if (res.ok) {
                        ui.showToast("Registro actualizado");
                    } else {
                        ui.showToast("Error al actualizar", "error");
                        cell.restoreOldValue();
                    }
                } catch (e) {
                    ui.showToast("Error de conexión", "error");
                    cell.restoreOldValue();
                }
            }
        });
    },

    bindEvents() {
        document.getElementById('maestra-search').addEventListener('keyup', (e) => {
            this.table.setFilter([
                [
                    { field: "cedula", type: "like", value: e.target.value },
                    { field: "id_proyecto", type: "like", value: e.target.value },
                    { field: "nombre_completo", type: "like", value: e.target.value }
                ]
            ]);
        });

        document.getElementById('btn-refresh-maestra').onclick = () => this.load();

        document.getElementById('btn-download-maestra').onclick = () => {
            this.table.download("xlsx", "BFinanciacion_Export.xlsx", { sheetName: "Financiacion" });
        };

        document.getElementById('btn-add-maestra').onclick = () => this.addRow();
    },

    async addRow() {
        const newItem = {
            cedula: "",
            id_contrato: "",
            id_proyecto: "",
            fecha_inicio: new Date().toISOString().split('T')[0],
            fecha_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
            salario_base: 0
        };

        try {
            const res = await api.post('/admin/maestra/financiacion', newItem);
            if (res.id) {
                ui.showToast("Registro creado");
                this.load();
            }
        } catch (e) {
            ui.showToast("Error al crear registro", "error");
        }
    },

    async deleteRow(row) {
        const id = row.getData().id_financiacion;
        if (!confirm(`¿Estás seguro de eliminar el registro ${id}?`)) return;

        try {
            const res = await api.delete(`/admin/maestra/financiacion/${id}`);
            if (res.ok) {
                ui.showToast("Registro eliminado");
                row.delete();
            }
        } catch (e) {
            ui.showToast("Error al eliminar", "error");
        }
    }
};
