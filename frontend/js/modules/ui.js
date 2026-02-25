/**
 * ui.js - Shared UI Components
 */

export const ui = {
    card(title, content) {
        return `
            <div class="card">
                ${title ? `<div class="card-header">${title}</div>` : ''}
                <div class="card-body">${content}</div>
            </div>
        `;
    },

    kpi(label, value, color = 'primary') {
        return `
            <div class="kpi-card ${color}">
                <div class="kpi-label">${label}</div>
                <div class="kpi-value">${value}</div>
            </div>
        `;
    },

    table(headers, rows) {
        return `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
};
