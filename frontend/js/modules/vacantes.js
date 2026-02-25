/**
 * vacantes.js - Vacancy Management Module (Enhanced with Cross-dependencies, Auto-ID & Conditional Actions)
 */

import { api } from './api.js';
import { ui } from '../ui.js';
import { auth } from './auth.js';

export const vacantes = {
    _allVacantes: [],
    _catalogos: null,

    async render() {
        const role = auth._user?.role;
        if (role !== 'admin' && role !== 'talento' && role !== 'nomina') {
            window.location.hash = '#/home';
            return;
        }

        try {
            document.getElementById('loader')?.classList.remove('hidden');
            const [vacRes, catRes] = await Promise.all([
                api.get('/admin/vacantes'),
                api.get('/admin/posiciones-catalogos')
            ]);
            document.getElementById('loader')?.classList.add('hidden');

            if (vacRes.ok) {
                this._allVacantes = vacRes.vacantes;
                this.renderList(this._allVacantes);
                this.updateKPIs();
                this.bindEvents();
            }

            if (catRes.ok) {
                this._catalogos = catRes.catalogos;
                this._renderDatalists();
            }
        } catch (err) {
            console.error("Error loading vacantes:", err);
            document.getElementById('loader')?.classList.add('hidden');
        }
    },

    updateKPIs() {
        const countEl = document.getElementById('vacante-count');
        if (countEl) countEl.textContent = this._allVacantes.length;
    },

    renderList(list) {
        const container = document.getElementById('vacantes-list-container');
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <div style="font-size: 40px; margin-bottom: 16px;">🔍</div>
                    <p>No se encontraron vacantes que coincidan con la búsqueda.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-wrap">
                <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
                    <thead>
                        <tr style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: var(--text-muted);">
                            <th style="padding-left: 16px;">POSICIÓN ID</th>
                            <th>CARGO / ROL</th>
                            <th>DIRECCIÓN / GERENCIA</th>
                            <th>PLANTA</th>
                            <th>FUENTE BASE</th>
                            <th class="text-right" style="padding-right: 16px;">ACCIONES</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${list.map(v => {
            const canEditDelete = v.contract_count === 0;
            return `
                            <tr style="background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                                <td style="padding: 16px; border-radius: 8px 0 0 8px; font-family: monospace; font-weight: 700; color: var(--primary);">${v.id}</td>
                                <td style="padding: 16px;">
                                    <div style="font-weight: 700; color: var(--text); font-size: 13px;">${v.cargo}</div>
                                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">${v.rol || '-'}</div>
                                </td>
                                <td style="padding: 16px;">
                                    <div style="font-weight: 700; color: var(--text); font-size: 13px;">${v.direccion || '-'}</div>
                                    <div style="font-size: 11px; color: var(--text-muted);">${v.gerencia || '-'}</div>
                                </td>
                                <td style="padding: 16px;">
                                    <span class="category-pill" style="background: #F1F5F9; color: #475569; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;">
                                        ${v.planta || '-'}
                                    </span>
                                </td>
                                <td style="padding: 16px; font-size: 11px; color: var(--text-muted); font-weight: 500;">${v.base_fuente || '-'}</td>
                                <td class="text-right" style="padding: 16px; border-radius: 0 8px 8px 0;">
                                    <div class="flex gap-1 justify-end">
                                        <button class="btn btn-ghost btn-sm view-vacante-btn" data-id="${v.id}" title="Ver Detalles">👁️</button>
                                        ${(auth.isAdmin() && canEditDelete) ? `
                                            <button class="btn btn-ghost btn-sm edit-vacante-btn" data-id="${v.id}" title="Editar">✏️</button>
                                            <button class="btn btn-ghost btn-sm delete-vacante-btn" data-id="${v.id}" style="color: #EF4444;" title="Eliminar">🗑️</button>
                                        ` : ''}
                                        <button class="btn btn-primary btn-sm project-vacante-btn" data-id="${v.id}" data-cargo="${v.cargo}" data-salario="${v.salario || 0}" style="background: var(--accent); border-color: var(--accent); white-space: nowrap; font-weight: 700; height: 32px;">📊 Proyectar</button>
                                    </div>
                                </td>
                            </tr>
                        `;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;
        this.bindListEvents();
    },

    bindEvents() {
        const searchInput = document.getElementById('vacante-search-input');
        if (searchInput) {
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);
            newSearch.addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase().trim();
                const filtered = this._allVacantes.filter(v =>
                    v.id.toLowerCase().includes(term) ||
                    v.cargo.toLowerCase().includes(term) ||
                    (v.area && v.area.toLowerCase().includes(term)) ||
                    (v.direccion && v.direccion.toLowerCase().includes(term)) ||
                    (v.gerencia && v.gerencia.toLowerCase().includes(term)) ||
                    (v.rol && v.rol.toLowerCase().includes(term))
                );
                this.renderList(filtered);
            });
        }

        const createBtn = document.getElementById('btn-nueva-posicion');
        if (createBtn) {
            createBtn.onclick = () => this.showForm();
        }
    },

    bindListEvents() {
        document.querySelectorAll('.view-vacante-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                await this.showDetail(id);
            });
        });

        document.querySelectorAll('.edit-vacante-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                await this.showForm(id);
            });
        });

        document.querySelectorAll('.delete-vacante-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                this.confirmDelete(id);
            });
        });

        document.querySelectorAll('.project-vacante-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const cargo = e.currentTarget.getAttribute('data-cargo');
                const salario = e.currentTarget.getAttribute('data-salario');
                this.showProyeccionForm(id, cargo, salario);
            });
        });
    },

    _renderDatalists() {
        if (!this._catalogos) return;
        document.querySelectorAll('.pos-datalist').forEach(el => el.remove());

        const container = document.body;
        for (const [key, values] of Object.entries(this._catalogos)) {
            if (key.startsWith('hierarchy') || key === 'p_jefe' || key === 'next_id') continue;
            const dl = document.createElement('datalist');
            dl.id = `dl-${key}`;
            dl.className = 'pos-datalist';
            values.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                dl.appendChild(opt);
            });
            container.appendChild(dl);
        }

        const dirs = [...new Set(this._catalogos.hierarchy_structure.map(h => h.Direccion))].filter(Boolean).sort();
        this._updateDatalist('dl-direccion', dirs);

        const cargos = [...new Set(this._catalogos.hierarchy_jobs.map(h => h.Cargo))].filter(Boolean).sort();
        this._updateDatalist('dl-cargo', cargos);
    },

    _updateDatalist(id, values) {
        let dl = document.getElementById(id);
        if (!dl) {
            dl = document.createElement('datalist');
            dl.id = id;
            dl.className = 'pos-datalist';
            document.body.appendChild(dl);
        }
        dl.innerHTML = '';
        values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            dl.appendChild(opt);
        });
    },

    async showDetail(id) {
        try {
            document.getElementById('loader')?.classList.remove('hidden');
            const res = await api.get(`/admin/consulta-vacante/${id}`);
            document.getElementById('loader')?.classList.add('hidden');

            if (res.ok) {
                const v = res.cabecera;
                const html = `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                        <div class="luxury-card" style="grid-column: span 2; background: #F8FAFC; border: none;">
                            <label style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--accent); letter-spacing: 0.1em;">Identificador de Posición</label>
                            <h2 style="font-size: 24px; font-weight: 900; color: var(--primary-dark); margin: 4px 0;">${v.id}</h2>
                            <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
                                👤 Editado por: <strong>${v.usuario || 'Sistema'}</strong> | 📅 Última mod: <strong>${ui.formatDate(v.modificacion)}</strong>
                            </div>
                        </div>
                        
                        <div>
                            <h3 style="font-size: 12px; text-transform: uppercase; color: var(--primary); margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Información del Cargo</h3>
                            ${this._dataRow('Cargo', v.cargo)}
                            ${this._dataRow('Rol', v.rol)}
                            ${this._dataRow('Banda', v.banda)}
                            ${this._dataRow('Familia', v.familia)}
                            ${this._dataRow('Estado', v.estado)}
                        </div>

                        <div>
                            <h3 style="font-size: 12px; text-transform: uppercase; color: var(--primary); margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Estructura Humboldt</h3>
                            ${this._dataRow('Dirección', v.direccion)}
                            ${this._dataRow('Gerencia', v.gerencia)}
                            ${this._dataRow('Área', v.area)}
                            ${this._dataRow('Planta', v.planta)}
                            ${this._dataRow('Jefe Inmediato (ID)', v.p_jefe)}
                        </div>

                        <div class="span-2" style="grid-column: span 2;">
                             <h3 style="font-size: 12px; text-transform: uppercase; color: var(--primary); margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">Presupuesto & Fuente</h3>
                             ${this._dataRow('Salario Presupuestado', ui.money(v.salario))}
                             ${this._dataRow('Fuente de Financiación Base', v.base_fuente)}
                             <p class="mt-4" style="font-size: 12px; color: #64748B;"><strong>Observaciones:</strong> ${v.observacion || 'Ninguna'}</p>
                        </div>
                    </div>
                `;
                ui.openModal(`Detalle de Vacante: ${v.cargo}`, html);
            }
        } catch (err) {
            console.error("Error showing vacancy detail:", err);
            document.getElementById('loader')?.classList.add('hidden');
        }
    },

    async showForm(id = null) {
        if (!this._catalogos) {
            const res = await api.get('/admin/posiciones-catalogos');
            if (res.ok) {
                this._catalogos = res.catalogos;
                this._renderDatalists();
            }
        }

        let v = {
            id: id || this._catalogos.next_id,
            cargo: '', rol: '', banda: '', familia: '',
            direccion: '', gerencia: '', area: '', subarea: '',
            planta: '', tipo_planta: '',
            base_fuente: '', salario: 0, p_jefe: '', observacion: '', estado: 'Vacante'
        };

        if (id) {
            try {
                document.getElementById('loader')?.classList.remove('hidden');
                const res = await api.get(`/admin/consulta-vacante/${id}`);
                document.getElementById('loader')?.classList.add('hidden');
                if (res.ok) v = res.cabecera;
            } catch (err) { console.error(err); }
        }

        const html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="span-2" style="grid-column: span 2; background: #EEF2FF; padding: 12px; border-radius: 8px; border: 1px solid #C7D2FE;">
                    <label class="muted" style="color: #4338CA;">ID DE POSICIÓN (Generado Automáticamente)</label>
                    <div style="font-size: 20px; font-weight: 900; color: #312E81;">${v.id}</div>
                    <input type="hidden" id="pos-id" value="${v.id}">
                </div>

                <!-- Job Hierarchy -->
                <div>
                    <label class="muted">CARGO</label>
                    <input type="text" id="pos-cargo" class="input" value="${v.cargo || ''}" list="dl-cargo" autocomplete="off">
                </div>
                <div>
                    <label class="muted">ROL</label>
                    <input type="text" id="pos-rol" class="input" value="${v.rol || ''}" list="dl-rol" autocomplete="off">
                </div>
                <div>
                    <label class="muted">FAMILIA</label>
                    <input type="text" id="pos-familia" class="input" value="${v.familia || ''}" list="dl-familia" autocomplete="off">
                </div>
                <div>
                    <label class="muted">BANDA</label>
                    <input type="text" id="pos-banda" class="input" value="${v.banda || ''}" list="dl-banda" autocomplete="off">
                </div>

                <!-- Structure Hierarchy -->
                <div>
                    <label class="muted">DIRECCIÓN</label>
                    <input type="text" id="pos-direccion" class="input" value="${v.direccion || ''}" list="dl-direccion" autocomplete="off">
                </div>
                <div>
                    <label class="muted">GERENCIA</label>
                    <input type="text" id="pos-gerencia" class="input" value="${v.gerencia || ''}" list="dl-gerencia" autocomplete="off">
                </div>
                <div>
                    <label class="muted">ÁREA</label>
                    <input type="text" id="pos-area" class="input" value="${v.area || ''}" list="dl-area" autocomplete="off">
                </div>
                <div>
                    <label class="muted">SUBAREA</label>
                    <input type="text" id="pos-subarea" class="input" value="${v.subarea || ''}" list="dl-subarea" autocomplete="off">
                </div>

                <div>
                    <label class="muted">PLANTA</label>
                    <input type="text" id="pos-planta" class="input" value="${v.planta || ''}" list="dl-planta" placeholder="Escriba Planta">
                </div>
                <div>
                    <label class="muted">TIPO PLANTA</label>
                    <input type="text" id="pos-tipo-planta" class="input" value="${v.tipo_planta || ''}" list="dl-tipo_planta" placeholder="Escriba Tipo Planta">
                </div>
                <div>
                    <label class="muted">SALARIO REF.</label>
                    <input type="number" id="pos-salario" class="input" value="${v.salario || 0}">
                </div>
                <div>
                    <label class="muted">ESTADO</label>
                    <input type="text" id="pos-estado" class="input" value="Vacante" disabled style="background: #F1F5F9; color: #64748B;">
                </div>
                <div class="span-2" style="grid-column: span 2;">
                    <label class="muted">JEFE INMEDIATO (Reporta a...)</label>
                    <select id="pos-p-jefe" class="input">
                        <option value="">Seleccione Jefe...</option>
                        ${(this._catalogos?.p_jefe || []).map(j => {
            const desc = j.nombre ? `${j.nombre} (${j.Cargo})` : `[VACANTE] - ${j.Cargo}`;
            return `<option value="${j.IDPosicion}" ${v.p_jefe === j.IDPosicion ? 'selected' : ''}>${j.IDPosicion} - ${desc}</option>`;
        }).join('')}
                    </select>
                </div>
                <div class="span-2" style="grid-column: span 2;">
                    <label class="muted">FUENTE BASE</label>
                    <input type="text" id="pos-fuente" class="input" value="${v.base_fuente || ''}" list="dl-base_fuente">
                </div>
                <div class="span-2" style="grid-column: span 2;">
                    <label class="muted">OBSERVACIONES</label>
                    <textarea id="pos-obs" class="input" style="height: 60px;">${v.observacion || ''}</textarea>
                </div>
                <div class="span-2" style="grid-column: span 2; margin-top: 10px;">
                    <button id="btn-save-pos" class="btn btn-primary" style="width: 100%; height: 44px; font-weight: 700;">
                        ${id ? '💾 Guardar Cambios' : '➕ Crear Posición'}
                    </button>
                </div>
            </div>
        `;

        ui.openModal(id ? `Editar Posición: ${id}` : 'Crear Nueva Posición', html);

        this._setupDependencyListeners();
        document.getElementById('btn-save-pos').onclick = () => this.savePosicion(id);
    },

    _setupDependencyListeners() {
        // Hierarchy 1: Structure
        const dInput = document.getElementById('pos-direccion');
        const gInput = document.getElementById('pos-gerencia');
        const aInput = document.getElementById('pos-area');
        const sInput = document.getElementById('pos-subarea');

        dInput.addEventListener('input', () => {
            const dir = dInput.value;
            const matches = this._catalogos.hierarchy_structure.filter(h => h.Direccion === dir);
            if (matches.length > 0) {
                const gers = [...new Set(matches.map(h => h.Gerencia))].filter(Boolean).sort();
                this._updateDatalist('dl-gerencia', gers);
            } else {
                this._updateDatalist('dl-gerencia', this._catalogos.gerencia || []);
            }
        });

        gInput.addEventListener('input', () => {
            const dir = dInput.value;
            const ger = gInput.value;
            const matches = this._catalogos.hierarchy_structure.filter(h => h.Direccion === dir && h.Gerencia === ger);
            if (matches.length > 0) {
                const areas = [...new Set(matches.map(h => h.Area))].filter(Boolean).sort();
                this._updateDatalist('dl-area', areas);
            } else {
                this._updateDatalist('dl-area', this._catalogos.area || []);
            }
        });

        aInput.addEventListener('input', () => {
            const dir = dInput.value;
            const ger = gInput.value;
            const area = aInput.value;
            const matches = this._catalogos.hierarchy_structure.filter(h => h.Direccion === dir && h.Gerencia === ger && h.Area === area);
            if (matches.length > 0) {
                const subs = [...new Set(matches.map(h => h.Subarea))].filter(Boolean).sort();
                this._updateDatalist('dl-subarea', subs);
            } else {
                this._updateDatalist('dl-subarea', this._catalogos.subarea || []);
            }
        });

        // Hierarchy 2: Jobs (Cargo -> Rol -> Familia -> Banda)
        const cargoInput = document.getElementById('pos-cargo');
        const rolInput = document.getElementById('pos-rol');
        const famInput = document.getElementById('pos-familia');
        const bandaInput = document.getElementById('pos-banda');

        cargoInput.addEventListener('input', () => {
            const cargo = cargoInput.value;
            const matches = this._catalogos.hierarchy_jobs.filter(h => h.Cargo === cargo);
            if (matches.length > 0) {
                const rols = [...new Set(matches.map(h => h.Rol))].filter(Boolean).sort();
                this._updateDatalist('dl-rol', rols);
            } else {
                this._updateDatalist('dl-rol', this._catalogos.rol || []);
            }
        });

        rolInput.addEventListener('input', () => {
            const cargo = cargoInput.value;
            const rol = rolInput.value;
            const matches = this._catalogos.hierarchy_jobs.filter(h => h.Cargo === cargo && h.Rol === rol);
            if (matches.length > 0) {
                const fams = [...new Set(matches.map(h => h.Familia))].filter(Boolean).sort();
                this._updateDatalist('dl-familia', fams);
            } else {
                this._updateDatalist('dl-familia', this._catalogos.familia || []);
            }
        });

        famInput.addEventListener('input', () => {
            const cargo = cargoInput.value;
            const rol = rolInput.value;
            const fam = famInput.value;
            const matches = this._catalogos.hierarchy_jobs.filter(h => h.Cargo === cargo && h.Rol === rol && h.Familia === fam);
            if (matches.length > 0) {
                const bandas = [...new Set(matches.map(h => h.Banda))].filter(Boolean).sort();
                this._updateDatalist('dl-banda', bandas);
            } else {
                this._updateDatalist('dl-banda', this._catalogos.banda || []);
            }
        });
    },

    async savePosicion(id = null) {
        const data = {
            IDPosicion: document.getElementById('pos-id').value,
            Salario: parseFloat(document.getElementById('pos-salario').value) || 0,
            Familia: document.getElementById('pos-familia').value.trim(),
            Cargo: document.getElementById('pos-cargo').value.trim(),
            Rol: document.getElementById('pos-rol').value.trim(),
            Banda: document.getElementById('pos-banda').value.trim(),
            Direccion: document.getElementById('pos-direccion').value.trim(),
            Gerencia: document.getElementById('pos-gerencia').value.trim(),
            Area: document.getElementById('pos-area').value.trim(),
            Subarea: document.getElementById('pos-subarea').value.trim(),
            Planta: document.getElementById('pos-planta').value.trim(),
            Tipo_planta: document.getElementById('pos-tipo-planta').value.trim(),
            Base_Fuente: document.getElementById('pos-fuente').value.trim(),
            Estado: 'Vacante',
            P_Jefe: document.getElementById('pos-p-jefe').value,
            Observacion: document.getElementById('pos-obs').value.trim()
        };

        if (!data.Cargo) {
            alert("El Cargo es obligatorio.");
            return;
        }

        try {
            ui.showLoading("Guardando datos...");
            let res;
            if (id) {
                res = await api.put(`/admin/posiciones/${id}`, data);
            } else {
                res = await api.post('/admin/posiciones', data);
            }
            ui.hideLoading();

            if (res.ok) {
                ui.closeModal();
                alert(res.message || "Operación exitosa");
                this.render();
            } else {
                alert("Error: " + (res.detail || "No se pudo guardar la posición."));
            }
        } catch (err) {
            ui.hideLoading();
            console.error(err);
            alert("Error de conexión.");
        }
    },

    confirmDelete(id) {
        ui.confirm("Eliminar Posición", `¿Está seguro de eliminar la posición ${id}? Esta acción no se puede deshacer y solo será permitida si no hay contratos históricos o activos asociados.`, async () => {
            try {
                ui.showLoading("Eliminando...");
                const res = await api.delete(`/admin/posiciones/${id}`);
                ui.hideLoading();
                if (res.ok) {
                    alert("Posición eliminada");
                    this.render();
                } else {
                    alert("No se pudo eliminar: " + (res.detail || "Error desconocido"));
                }
            } catch (err) {
                ui.hideLoading();
                alert("Error de conexión");
            }
        });
    },

    async showProyeccionForm(id, cargo, prefillSalary) {
        let currentSalary = prefillSalary || 0;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;
        const yearEnd = `${year}-12-31`;

        const html = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <p style="font-size: 13px; color: #64748B; margin: 0;">
                    Defina los parámetros para proyectar el costo total de esta vacante.
                </p>
                
                <div>
                    <label class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Salario Mensual Base (COP)</label>
                    <input type="number" id="proj-salario" value="${currentSalary}" placeholder="Ej: 5000000" 
                        style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 4px; font-family: 'Outfit'; font-weight: 700; color: var(--primary); font-size: 16px;">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div>
                        <label class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Fecha Inicio</label>
                        <input type="date" id="proj-inicio" value="${today}" min="${today}" 
                            style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 4px; font-family: 'Outfit';">
                    </div>
                    <div>
                        <label class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Fecha Fin</label>
                        <input type="date" id="proj-fin" value="${yearEnd}" 
                            style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 4px; font-family: 'Outfit';">
                    </div>
                </div>

                <div id="proj-result-container" style="margin-top: 8px;"></div>

                <button id="run-proj-btn" class="btn btn-primary" style="width: 100%; height: 48px; font-weight: 700; justify-content: center; margin-top: 8px;">
                    🚀 Calcular Costo Proyectado
                </button>
            </div>
        `;

        ui.openModal(`Proyectar Costo: ${cargo}`, html);

        // Ensure date validation on change as well
        const startInput = document.getElementById('proj-inicio');
        startInput.addEventListener('change', (e) => {
            if (e.target.value < today) {
                e.target.value = today;
                alert("La fecha de inicio no puede ser en el pasado.");
            }
        });

        document.getElementById('run-proj-btn').addEventListener('click', () => {
            this.runProyeccion(id);
        });
    },

    async runProyeccion(id) {
        const salario = document.getElementById('proj-salario').value;
        const inicio = document.getElementById('proj-inicio').value;
        const fin = document.getElementById('proj-fin').value;

        if (!salario || !inicio || !fin) {
            alert("Por favor complete todos los campos.");
            return;
        }

        const container = document.getElementById('proj-result-container');
        container.innerHTML = `<div style="text-align: center; padding: 20px;"><div class="loader-spinner"></div><p>Calculando...</p></div>`;

        try {
            const res = await api.get(`/admin/proyectar-vacante/${id}?fecha_inicio=${inicio}&fecha_fin=${fin}&salario=${salario}`);
            if (res.ok) {
                const s = res.summary;
                container.innerHTML = `
                    <div class="luxury-card" style="background: var(--primary-dark); color: white; border: none; margin-bottom: 20px;">
                        <div style="font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 800; letter-spacing: 0.1em;">Costo Total del Periodo</div>
                        <div style="font-size: 32px; font-weight: 900; margin: 4px 0;">${ui.money(s.total)}</div>
                        <div style="display: flex; gap: 20px; margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">
                            <div>
                                <div style="font-size: 9px; opacity: 0.6; text-transform: uppercase;">Promedio Mensual</div>
                                <div style="font-weight: 700;">${ui.money(s.promedio_mensual)}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; opacity: 0.6; text-transform: uppercase;">Meses Proyectados</div>
                                <div style="font-weight: 700;">${s.meses}</div>
                            </div>
                        </div>
                    </div>

                    <h4 style="font-size: 12px; text-transform: uppercase; color: var(--primary); margin-bottom: 12px;">Desglose Mensual Proyectado</h4>
                    <div class="table-wrap" style="max-height: 300px; overflow-y: auto; border: 1px solid #E2E8F0; border-radius: 12px;">
                        <table style="font-size: 12px;">
                            <thead>
                                <tr style="background: #F8FAFC;">
                                    <th>Mes</th>
                                    <th class="text-right">Días</th>
                                    <th class="text-right">Sueldo Base</th>
                                    <th class="text-right">Carga Prestacional</th>
                                    <th class="text-right">Costo Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${res.projection.map(m => {
                    const carga = m.total - m.detalle[0].conceptos.salario_mes;
                    return `
                                        <tr>
                                            <td style="font-weight: 700;">${m.anioMes}</td>
                                            <td class="text-right">${m.detalle[0].dias}</td>
                                            <td class="text-right">${ui.money(m.detalle[0].conceptos.salario_mes)}</td>
                                            <td class="text-right">${ui.money(carga)}</td>
                                            <td class="text-right" style="font-weight: 700; color: var(--primary);">${ui.money(m.total)}</td>
                                        </tr>
                                    `;
                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                container.innerHTML = `<div class="alert alert-error">Error: ${res.detail || 'No se pudo realizar la projection'}</div>`;
            }
        } catch (err) {
            console.error(err);
            container.innerHTML = `<div class="alert alert-error">Error de conexión con el servidor.</div>`;
        }
    },

    _dataRow(label, value) {
        return `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9; font-size: 13px;">
                <span style="color: #64748B;">${label}:</span>
                <span style="font-weight: 600; color: #0F172A;">${value || '-'}</span>
            </div>
        `;
    }
};
