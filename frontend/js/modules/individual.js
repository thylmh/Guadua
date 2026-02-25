/**
 * individual.js - Individual Consultation (Restored & Enhanced)
 */

import { api } from '../modules/api.js';
import { ui } from '../ui.js';

export const individual = {
    _catalogs: null,
    _currentCedula: null,
    selectedYear: new Date().getFullYear(),

    async search(cedula) {
        if (!cedula) return;
        this._currentCedula = cedula;

        try {
            document.getElementById('loader').classList.remove('hidden'); // Show Loader
            const res = await api.get(`/employees/consulta/${cedula}?anio=${this.selectedYear}`);
            document.getElementById('loader').classList.add('hidden'); // Hide Loader

            if (res.ok && res.empleado) {
                // Load catalogs first to ensure names can be resolved
                if (!this._catalogs) await this.loadCatalogos();

                // Save globally for UI helpers
                window._LAST_EMPLOYEE_DATA = res;

                // Load Pending Requests
                const pendingRes = await api.get(`/employees/solicitudes/pendientes/${cedula}`);
                const pendingRequests = pendingRes || [];

                // Sort tramos by date ASC (oldest first)
                const sortedTramos = (res.tramos || []).sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));

                ui.renderProfile({
                    empleado: res.empleado,
                    cabecera: res.cabecera,
                    alerta_inactivo: res.alerta_inactivo,
                    tramos: sortedTramos,
                    months: res.months,
                    catalogs: this._catalogs,
                    pendingRequests: pendingRequests,
                    availableYears: res.available_years,
                    selectedYear: this.selectedYear,
                    resumen_proyectos_v2: res.resumen_proyectos_v2
                });

                // Bind Events
                this.bindEvents();
            } else {
                alert("Servidor no encontrado o error en la consulta.");
            }
        } catch (err) {
            console.error("Search error:", err);
            alert("No se pudo conectar con el servidor.");
        }
    },

    async loadCatalogos() {
        try {
            const res = await api.get('/employees/catalogos');
            this._catalogs = res;
        } catch (e) {
            console.error("Error loading catalogs", e);
        }
    },

    bindEvents() {
        // Add Tramo
        document.getElementById('add-tramo-btn')?.addEventListener('click', () => {
            if (!this._catalogs) { alert("Cargando catálogos..."); return; }
            this.openTramoModal();
        });

        // Edit Tramo
        document.querySelectorAll('.edit-tramo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this._catalogs) { alert("Cargando catálogos..."); return; }
                const data = JSON.parse(e.currentTarget.getAttribute('data-json'));
                this.openTramoModal(data);
            });
        });

        // Duplicate Tramo
        document.querySelectorAll('.duplicate-tramo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this._catalogs) { alert("Cargando catálogos..."); return; }
                const data = JSON.parse(e.currentTarget.getAttribute('data-json'));
                // Duplication: remove ID and dates
                const clone = { ...data };
                delete clone.id_financiacion;
                delete clone.fecha_inicio;
                delete clone.fecha_fin;
                this.openTramoModal(clone);
            });
        });

        // Delete Tramo
        document.querySelectorAll('.delete-tramo-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const btnEl = e.currentTarget;
                const id = btnEl.getAttribute('data-id');

                if (!id) {
                    console.error("No se encontró el ID del tramo para eliminar.");
                    return;
                }

                ui.confirm('Eliminar Tramo', '¿Estás seguro de eliminar este tramo de financiación? Esta acción no se puede deshacer.', async () => {
                    try {
                        document.getElementById('loader')?.classList.remove('hidden');
                        const res = await api.delete(`/employees/borrar/${id}`);
                        document.getElementById('loader')?.classList.add('hidden');

                        if (res.ok) {
                            this.search(this._currentCedula); // Reload
                        } else {
                            alert("No se pudo eliminar: " + (res.detail || "Error desconocido"));
                        }
                    } catch (err) {
                        document.getElementById('loader')?.classList.add('hidden');
                        console.error("Error al borrar tramo:", err);
                        alert("Ocurrió un error al intentar eliminar el tramo.");
                    }
                }, '🗑️');
            });
        });
    },

    openTramoModal(data = null) {
        const isEdit = !!data;
        const cats = this._catalogs;

        // Sort catalogs alphabetically for display
        const sortByName = (list) => (list || []).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

        const html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <input type="hidden" id="tramo-id" value="${data?.id_financiacion || ''}">
                
                <div>
                    <label class="muted" style="font-size: 11px;">Fecha Inicio</label>
                    <input type="date" id="tramo-inicio" value="${data?.fecha_inicio ? data.fecha_inicio.split('T')[0] : ''}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div>
                    <label class="muted" style="font-size: 11px;">Fecha Fin</label>
                    <input type="date" id="tramo-fin" value="${data?.fecha_fin ? data.fecha_fin.split('T')[0] : ''}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>

                <div>
                    <label class="muted" style="font-size: 11px;">Salario</label>
                    <input type="number" id="tramo-salario" value="${data?.salario_base || 0}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div>
                    <label class="muted" style="font-size: 11px;">Rubro</label>
                    <input type="text" id="tramo-rubro" value="${data?.rubro || ''}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                
                <div class="span-12" style="grid-column: span 2;">
                     ${ui.renderSearchableSelect('tramo-proyecto', 'Proyecto', sortByName(cats.proyectos), data?.id_proyecto)}
                </div>

                <div>
                    ${ui.renderSearchableSelect('tramo-fuente', 'Fuente', sortByName(cats.fuentes), data?.id_fuente)}
                </div>
                <div>
                    ${ui.renderSearchableSelect('tramo-componente', 'Componente', sortByName(cats.componentes), data?.id_componente)}
                </div>

                <div>
                    ${ui.renderSearchableSelect('tramo-subcomponente', 'Subcomponente', sortByName(cats.subcomponentes), data?.id_subcomponente)}
                </div>
                <div>
                    ${ui.renderSearchableSelect('tramo-categoria', 'Categoría', sortByName(cats.categorias), data?.id_categoria)}
                </div>

                <div class="span-12" style="grid-column: span 2;">
                     ${ui.renderSearchableSelect('tramo-responsable', 'Responsable', sortByName(cats.responsables), data?.id_responsable)}
                </div>
                
                <div class="span-12" style="grid-column: span 2;">
                    <label class="muted" style="font-size: 11px;">Justificación del Cambio (Requerido)</label>
                    <textarea id="tramo-justificacion" placeholder="Indique la razón del cambio o creación..." style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); min-height: 60px;"></textarea>
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-4" style="border-top: 1px solid var(--border); padding-top: 16px;">
                <button id="save-tramo-btn" class="btn btn-primary" style="width: 100%; justify-content: center;">💾 Guardar</button>
            </div>
        `;

        ui.openModal(isEdit ? 'Editar Financiación' : 'Nueva Financiación', html);

        // Initialize Searchable Components
        ui.initSearchableSelect('tramo-proyecto');
        ui.initSearchableSelect('tramo-fuente');
        ui.initSearchableSelect('tramo-componente');
        ui.initSearchableSelect('tramo-subcomponente');
        ui.initSearchableSelect('tramo-categoria');
        ui.initSearchableSelect('tramo-responsable');

        document.getElementById('save-tramo-btn').addEventListener('click', async () => {
            const payload = {
                id: document.getElementById('tramo-id').value || null,
                cedula: this._currentCedula,
                fechaInicio: document.getElementById('tramo-inicio').value,
                fechaFin: document.getElementById('tramo-fin').value,
                salario: parseFloat(document.getElementById('tramo-salario').value),
                proyecto: document.getElementById('tramo-proyecto').value,
                rubro: document.getElementById('tramo-rubro').value,
                fuente: document.getElementById('tramo-fuente').value,
                componente: document.getElementById('tramo-componente').value,
                // Default checks to avoid null errors if backend expects them
                subcomponente: document.getElementById('tramo-subcomponente').value,
                categoria: document.getElementById('tramo-categoria').value,
                responsable: document.getElementById('tramo-responsable').value,
                justificacion: document.getElementById('tramo-justificacion').value
            };

            if (!payload.justificacion || payload.justificacion.trim().length < 5) {
                alert("Por favor ingrese una justificación válida para el cambio.");
                return;
            }

            // Overlap Validation
            // Use local date parsing to avoid timezone shift (e.g. UTC converting to previous day)
            const parseLocal = (s) => {
                const p = s.split('T')[0].split('-');
                return new Date(p[0], p[1] - 1, p[2]);
            };

            const existingTramos = window._LAST_EMPLOYEE_DATA?.tramos || [];
            const newStart = parseLocal(payload.fechaInicio);
            const newEnd = parseLocal(payload.fechaFin);

            if (isNaN(newStart) || isNaN(newEnd)) {
                alert("Por favor ingrese fechas válidas.");
                return;
            }

            const overlap = existingTramos.find(t => {
                // Skip if it's the same record we are editing
                if (payload.id && t.id_financiacion === payload.id) return false;

                const exStart = parseLocal(t.fecha_inicio);
                const exEnd = parseLocal(t.fecha_fin);

                // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
                return (newStart <= exEnd && newEnd >= exStart);
            });

            if (overlap) {
                ui.confirm('Aviso de Traslape', `El periodo seleccionado se cruza con otro tramo existente (${overlap.fecha_inicio.split('T')[0]} a ${overlap.fecha_fin.split('T')[0]}). ¿Deseas guardar de todas formas?`, () => {
                    this.executeSave(payload);
                });
                return;
            }

            this.executeSave(payload);
        });
    },

    async executeSave(payload) {
        try {
            const res = await api.post('/employees/guardar', payload);
            if (res.ok) {
                ui.closeModal();
                if (res.message) {
                    ui.confirm('Solicitud Enviada', res.message, () => {
                        this.search(this._currentCedula);
                    }, '✅');
                } else {
                    this.search(this._currentCedula); // Refetch to show changes
                }
            }
        } catch (e) {
            alert("Error al guardar: " + e.message);
        }
    }
};
