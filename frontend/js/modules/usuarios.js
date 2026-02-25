import { api } from './api.js';
import { ui } from '../ui.js';

export const usuarios = {
    // Role Definitions & Visual Config
    ROLES: {
        'admin': {
            k: 'admin', label: 'Super Administrador', color: '#0F172A', bg: '#F1F5F9',
            perms: ['dashboard', 'consulta', 'financiero', 'admin'],
            desc: 'Control total del sistema'
        },
        'financiero': {
            k: 'financiero', label: 'Analista Financiero', color: '#059669', bg: '#ECFDF5',
            perms: ['dashboard', 'consulta', 'financiero'],
            desc: 'Acceso a módulos de proyección y costos'
        },
        'talento': {
            k: 'talento', label: 'Talento Humano', color: '#7C3AED', bg: '#F5F3FF',
            perms: ['dashboard', 'consulta', 'financiero', 'vacantes'],
            desc: 'Gestión de personal y consultas'
        },
        'nomina': {
            k: 'nomina', label: 'Gestor de Nómina', color: '#F59E0B', bg: '#FFFBEB',
            perms: ['dashboard', 'consulta', 'financiero', 'nomina'],
            desc: 'Acceso a liquidación y conciliación de nómina'
        },
        'user': {
            k: 'user', label: 'Consulta General', color: '#3B82F6', bg: '#EFF6FF',
            perms: ['dashboard', 'consulta'],
            desc: 'Visualización básica de contratos'
        }
    },

    MODULE_ICONS: {
        'dashboard': '📊',
        'consulta': '🔍',
        'financiero': '📈',
        'nomina': '🧾',
        'vacantes': '🏢',
        'admin': '⚙️'
    },

    async load() {
        try {
            const list = await api.get('/admin/whitelist');
            const container = document.getElementById('admin-module-container');
            if (!container) return;

            container.innerHTML = `
                <div class="luxury-card mt-4">
                    <div class="flex justify-between align-center mb-6 pb-4 border-bottom">
                        <div>
                            <h3 style="margin-bottom: 4px;">Directorio de Usuarios</h3>
                            <p class="text-muted" style="font-size: 13px;">Gestione los permisos y roles de acceso a la plataforma.</p>
                        </div>
                        <button class="btn btn-primary btn-sm" id="add-user-btn" style="box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);">+ Autorizar Nuevo Usuario</button>
                    </div>
                    
                    <div class="table-wrap">
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
                            <thead>
                                <tr style="text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; color: var(--text-muted);">
                                    <th style="padding-left: 16px;">Usuario</th>
                                    <th>Perfil Asignado</th>
                                    <th>Módulos Habilitados</th>
                                    <th>Estado</th>
                                    <th class="text-right" style="padding-right: 16px;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="whitelist-tbody">
                                ${Array.isArray(list) ? list.map(u => this.renderRow(u)).join('') : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // Bind Add Event
            document.getElementById('add-user-btn').addEventListener('click', () => this.openAddModal());

            // Bind Actions
            this.bindEvents();

        } catch (e) {
            console.error(e);
            ui.showLoading("Error recargando..."); // Just in case
            setTimeout(ui.hideLoading, 500);
        }
    },

    renderRow(u) {
        // Fallback for unknown roles
        const roleKey = this.ROLES[u.role] ? u.role : 'user';
        const roleConfig = this.ROLES[roleKey];

        let initials = u.email.substring(0, 2).toUpperCase();
        if (u.p_nombre && u.p_apellido) {
            initials = (u.p_nombre[0] + u.p_apellido[0]).toUpperCase();
        } else if (u.nombre_completo) {
            initials = u.nombre_completo.split(' ').map(n => n[0]).slice(0, 2).join('');
        }

        // Data enrichment visualization
        const isLinked = !!u.is_mapped;
        const hasCedula = !!u.display_cedula;

        // FORMAT: First Name + Last Name (e.g. "Juan Perez")
        let nameDisplay = u.email;
        if (u.p_nombre && u.p_apellido) {
            nameDisplay = `${u.p_nombre} ${u.p_apellido}`;
        } else if (u.nombre_completo) {
            nameDisplay = u.nombre_completo;
        }

        let subDisplay = u.email;
        if (u.cargo) subDisplay = u.cargo;
        if (u.Direccion) subDisplay += ` • ${u.Direccion}`;

        // ... (modulesHtml remains same)
        let modulesHtml = `<div class="flex gap-2">`;
        Object.keys(this.MODULE_ICONS).forEach(mod => {
            const isActive = roleConfig.perms.includes(mod);
            modulesHtml += `
                <div title="${isActive ? 'Habilitado' : 'Restringido'}" 
                    style="
                        width: 24px; height: 24px; border-radius: 6px; 
                        display: flex; align-items: center; justify-content: center; 
                        background: ${isActive ? '#F0F9FF' : '#F8FAFC'}; 
                        border: 1px solid ${isActive ? '#BAE6FD' : '#E2E8F0'};
                        opacity: ${isActive ? 1 : 0.3};
                        font-size: 12px; cursor: help;
                    ">
                    ${this.MODULE_ICONS[mod]}
                </div>
            `;
        });
        modulesHtml += `</div>`;

        return `
            <tr style="background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: transform 0.2s;">
                <td style="padding: 16px; border-radius: 8px 0 0 8px;">
                    <div class="flex align-center gap-3">
                        <div style="
                            width: 32px; height: 32px; background: ${isLinked ? roleConfig.color : '#CBD5E1'}; color: white; 
                            border-radius: 50%; display: flex; align-items: center; justify-content: center; 
                            font-size: 11px; font-weight: 700; flex-shrink: 0;">
                            ${initials}
                        </div>
                        <div>
                            <div style="font-weight: 700; color: var(--text); font-size: 13px; text-transform: capitalize;">${nameDisplay.toLowerCase()}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">${subDisplay}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 16px;">
                    <span style="
                        background: ${roleConfig.bg}; color: ${roleConfig.color}; 
                        padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700;
                        border: 1px solid ${roleConfig.color}20; text-transform: uppercase; letter-spacing: 0.05em;
                        white-space: nowrap;
                    ">
                        ${roleConfig.label}
                    </span>
                </td>
                <td style="padding: 16px;">
                    ${modulesHtml}
                </td>
                <td style="padding: 16px;">
                    <div class="flex align-center gap-2">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${isLinked ? '#10B981' : (hasCedula ? '#F59E0B' : '#E2E8F0')};" 
                             title="${hasCedula && !isLinked ? 'Cédula guardada pero no encontrada en BData' : ''}"></div>
                        <span style="font-size: 12px; font-weight: 600; color: ${isLinked ? '#065F46' : (hasCedula ? '#B45309' : '#64748B')};">
                            ${isLinked ? 'Vinculado' : (hasCedula ? 'ID No Encontrado' : 'Sin Datos')}
                        </span>
                    </div>
                </td>
                <td class="text-right" style="padding: 16px; border-radius: 0 8px 8px 0;">
                    <div class="flex justify-end gap-2">
                        <button class="btn btn-ghost btn-sm edit-user-btn" data-email="${u.email}" data-role="${u.role}" data-cedula="${u.whitelist_cedula || ''}" title="Editar Rol">
                            ✏️
                        </button>
                        <button class="btn btn-ghost btn-sm delete-user-btn" data-email="${u.email}" style="color: var(--danger); background: #FEF2F2;" title="Revocar Acceso">
                            ✕
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },

    bindEvents() {
        document.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const email = e.currentTarget.getAttribute('data-email');
                ui.confirm('Revocar Acceso', `¿Estás seguro de eliminar a ${email}? Perderá el acceso inmediatamente.`, async () => {
                    await api.delete(`/admin/whitelist/${email}`);
                    this.load();
                });
            });
        });

        document.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const email = e.currentTarget.getAttribute('data-email');
                const role = e.currentTarget.getAttribute('data-role');
                const cedula = e.currentTarget.getAttribute('data-cedula');
                this.openAddModal(email, role, cedula);
            });
        });
    },

    openAddModal(email = null, currentRole = 'user', cedula = '') {
        const isEdit = !!email;
        let roleOptions = '';

        Object.values(this.ROLES).forEach(r => {
            roleOptions += `
                <div class="role-option" data-value="${r.k}" onclick="selectRole(this, '${r.k}')"
                    style="
                        border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer;
                        display: flex; align-items: center; gap: 12px; transition: all 0.2s;
                    "
                    onmouseover="this.style.borderColor='var(--primary)'"
                    onmouseout="if(!this.classList.contains('selected')) this.style.borderColor='var(--border)'"
                >
                    <div style="width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${r.color}; box-shadow: inset 0 0 0 2px white; background: ${currentRole === r.k ? r.color : 'transparent'}"></div>
                    <div>
                        <div style="font-weight: 700; color: var(--text); font-size: 13px;">${r.label}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${r.desc}</div>
                    </div>
                </div>
            `;
        });

        const html = `
            <div class="flex gap-4" style="flex-direction: column;">
                <div>
                    <label class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Cédula de Ciudadanía (ID)</label>
                    <input type="text" id="new-user-cedula" value="${cedula || ''}" 
                        placeholder="Ej. 12345678" 
                        style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 4px; font-family: 'Outfit';">
                     <p id="cedula-status" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Ingrese la cédula para buscar el correo automáticamente.</p>
                </div>

                <div>
                    <label class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase;">Cuenta Google (Email)</label>
                    <input type="email" id="new-user-email" value="${email || ''}" ${isEdit ? 'disabled' : ''} 
                        placeholder="usuario@humboldt.org.co" 
                        style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-top: 4px; font-family: 'Outfit';">
                </div>
                
                <div style="margin-top: 12px;">
                    <label class="muted" style="font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; display: block;">Asignar Perfil</label>
                    <div id="role-selector">
                        ${roleOptions}
                    </div>
                    <input type="hidden" id="selected-role" value="${currentRole}">
                </div>

                <style>
                    .role-option.selected {
                        background: #F0F9FF;
                        border-color: var(--primary) !important;
                    }
                </style>
                <script>
                    function selectRole(el, val) {
                        document.querySelectorAll('.role-option').forEach(d => {
                             d.classList.remove('selected');
                             d.querySelector('div:first-child').style.background = 'transparent';
                        });
                        el.classList.add('selected');
                        el.querySelector('div:first-child').style.background = getComputedStyle(el.querySelector('div:first-child')).borderColor;
                        document.getElementById('selected-role').value = val;
                    }
                    // Select initial
                    setTimeout(() => {
                        const initial = document.querySelector('.role-option[data-value="${currentRole}"]');
                        if(initial) initial.click(); // Trigger visual state
                    }, 50);
                </script>

                <button id="save-user-btn" class="btn btn-primary mt-4" style="justify-content: center;">
                    ${isEdit ? 'Guardar Cambios' : 'Habilitar Acceso'}
                </button>
            </div>
        `;

        ui.openModal(isEdit ? 'Configurar Usuario' : 'Nuevo Usuario', html);

        // Auto-lookup logic with debounce
        const cedulaInput = document.getElementById('new-user-cedula');
        const emailInput = document.getElementById('new-user-email');
        const statusP = document.getElementById('cedula-status');

        let lookupTimeout;
        cedulaInput.addEventListener('input', () => {
            clearTimeout(lookupTimeout);
            const rawVal = cedulaInput.value.trim();
            // Clean value: remove dots, dashes, spaces
            const cleanVal = rawVal.replace(/[.\-\s]/g, '');

            if (cleanVal.length < 5) {
                statusP.textContent = 'Ingrese la cédula para buscar el correo automáticamente.';
                statusP.style.color = 'var(--text-muted)';
                return;
            }

            statusP.textContent = 'Buscando en base de datos...';
            statusP.style.color = 'var(--text-muted)';

            lookupTimeout = setTimeout(async () => {
                try {
                    // Use cleanVal for the API call
                    const res = await api.get(`/admin/user-lookup?cedula=${cleanVal}`, true);

                    if (res && res.found && res.email) {
                        if (!isEdit) {
                            emailInput.value = res.email;
                            emailInput.style.backgroundColor = '#F0F9FF';
                            setTimeout(() => emailInput.style.backgroundColor = '', 1000);
                        }
                        statusP.innerHTML = `<span style="color:#059669">✓ Encontrado:</span> <strong>${res.nombre}</strong>`;
                        statusP.style.color = '#059669';
                    } else if (res && res.error) {
                        statusP.textContent = `⚠️ Error DB: ${res.error.substring(0, 50)}`;
                        statusP.style.color = '#DC2626';
                    } else {
                        statusP.textContent = '⚠️ No se encontró empleado con esta cédula en BData.';
                        statusP.style.color = '#D97706';
                    }
                } catch (e) {
                    console.error('Error lookup:', e);
                    // Detailed error
                    statusP.textContent = `Error: ${e.message.includes('token <') ? 'Ruta no encontrada (404)' : 'Verifique conexión'}`;
                    statusP.style.color = '#DC2626';
                }
            }, 600);
        });

        // Handle Role Selection (redundancy for direct click)
        const options = document.querySelectorAll('.role-option');
        options.forEach(opt => {
            opt.addEventListener('click', (e) => {
                options.forEach(o => {
                    o.classList.remove('selected');
                    o.querySelector('div:first-child').style.background = 'transparent';
                });
                const el = e.currentTarget;
                el.classList.add('selected');
                const color = el.querySelector('div:first-child').style.borderColor;
                el.querySelector('div:first-child').style.background = color;
                document.getElementById('selected-role').value = el.getAttribute('data-value');
            });
            // Init state
            if (opt.getAttribute('data-value') === currentRole) {
                opt.click();
            }
        });

        document.getElementById('save-user-btn').addEventListener('click', async () => {
            const emailInp = document.getElementById('new-user-email');
            const emailVal = emailInp.value.trim();
            const roleVal = document.getElementById('selected-role').value;
            const cedulaVal = document.getElementById('new-user-cedula').value.trim();

            if (emailVal) {
                ui.showLoading(isEdit ? "Actualizando perfil..." : "Autorizando usuario...");
                try {
                    await api.post('/admin/whitelist', { email: emailVal, role: roleVal, cedula: cedulaVal });
                    ui.closeModal();
                    this.load();
                } catch (e) {
                    api.showError ? api.showError(e) : alert(e.message);
                } finally {
                    ui.hideLoading();
                }
            } else {
                emailInp.style.borderColor = 'var(--danger)';
                emailInp.focus();
                statusP.textContent = '⚠️ El correo es obligatorio para autorizar el acceso.';
                statusP.style.color = '#DC2626';
            }
        });
    }
};

