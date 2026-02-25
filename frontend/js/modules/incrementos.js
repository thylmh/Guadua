import { api } from './api.js';
import { ui } from '../ui.js';

export const incrementos = {
    async load() {
        try {
            const list = await api.get('/admin/incrementos');
            const container = document.getElementById('admin-module-container');
            if (!container) return;

            container.innerHTML = `
                <div class="luxury-card mt-4">
                    <div class="flex justify-between align-center mb-4 pb-2 border-bottom">
                        <h3>Parámetros Financieros Anuales</h3>
                        <button class="btn btn-primary btn-sm" id="add-inc-btn">+ Nuevo Año</button>
                    </div>
                    <div class="table-wrap">
                        <table style="font-size: 13px;">
                            <thead><tr><th>Año</th><th>SMLV</th><th>Aux. Transp.</th><th>Aumento %</th><th>Dotación</th><th>Acciones</th></tr></thead>
                            <tbody>
                                ${Array.isArray(list) ? list.map(i => `
                                    <tr>
                                        <td style="font-weight: 700;">${i.anio}</td>
                                        <td class="text-right">${ui.money(i.smlv)}</td>
                                        <td class="text-right">${ui.money(i.transporte)}</td>
                                        <td class="text-right">${i.porcentaje_aumento}%</td>
                                        <td class="text-right">${ui.money(i.dotacion)}</td>
                                        <td><button class="btn btn-ghost btn-sm edit-inc-btn" data-json='${JSON.stringify(i)}'>✏️</button></td>
                                    </tr>
                                `).join('') : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            document.getElementById('add-inc-btn').addEventListener('click', () => this.openModal());
            document.querySelectorAll('.edit-inc-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const data = JSON.parse(e.currentTarget.getAttribute('data-json'));
                    this.openModal(data);
                });
            });

        } catch (e) { console.error(e); }
    },

    openModal(data = null) {
        const isEdit = !!data;
        const html = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div>
                    <label class="muted" style="font-size: 11px;">AÑO VIGENCIA</label>
                    <input type="number" id="inc-anio" value="${data?.anio || new Date().getFullYear()}" ${isEdit ? 'disabled' : ''} style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div>
                    <label class="muted" style="font-size: 11px;">PORCENTAJE AUMENTO</label>
                    <input type="number" id="inc-pct" value="${data?.porcentaje_aumento || 0}" step="0.01" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div>
                    <label class="muted" style="font-size: 11px;">SMLV</label>
                    <input type="number" id="inc-smlv" value="${data?.smlv || 0}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div>
                    <label class="muted" style="font-size: 11px;">AUX. TRANSPORTE</label>
                    <input type="number" id="inc-aux" value="${data?.transporte || 0}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div>
                    <label class="muted" style="font-size: 11px;">DOTACIÓN</label>
                    <input type="number" id="inc-dot" value="${data?.dotacion || 0}" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
            </div>
            <button id="save-inc-btn" class="btn btn-primary mt-4" style="width: 100%; justify-content: center;">Guardar Parámetros</button>
        `;
        ui.openModal(isEdit ? 'Editar Parámetros' : 'Nuevo Año Fiscal', html);

        document.getElementById('save-inc-btn').addEventListener('click', async () => {
            const payload = {
                anio: parseInt(document.getElementById('inc-anio').value),
                smlv: parseFloat(document.getElementById('inc-smlv').value),
                transporte: parseFloat(document.getElementById('inc-aux').value),
                dotacion: parseFloat(document.getElementById('inc-dot').value),
                porcentaje_aumento: parseFloat(document.getElementById('inc-pct').value)
            };
            await api.post('/admin/incrementos', payload);
            ui.closeModal();
            this.load();
        });
    }
};
