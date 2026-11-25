'use strict';
// Utilidades de fecha en hora de Colombia (UTC-5) y error de negocio
process.env.TZ = process.env.TZ || 'America/Bogota';
const pad = (n) => String(n).padStart(2, '0');
// RELOJ_DEMO permite fijar la hora en demostraciones (ej. 2026-11-23T09:30:00)
const reloj = { ahora: () => (process.env.RELOJ_DEMO ? new Date(process.env.RELOJ_DEMO) : new Date()) };
function fechaISO(d = reloj.ahora()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fechaHora(d = reloj.ahora()) { return `${fechaISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function horaHM(d = reloj.ahora()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function sumarDias(iso, n) { const [y, m, d] = iso.split('-').map(Number); const x = new Date(y, m - 1, d + n); return fechaISO(x); }
function aMinutos(hm) { const [h, m] = String(hm).slice(0, 5).split(':').map(Number); return h * 60 + m; }
function deMinutos(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
function minutosDesde(fh) { return (reloj.ahora() - new Date(String(fh).replace(' ', 'T'))) / 60000; }
class ErrorNegocio extends Error {
  constructor(status, codigo, mensaje) { super(mensaje); this.status = status; this.codigo = codigo; }
}
module.exports = { reloj, fechaISO, fechaHora, horaHM, sumarDias, aMinutos, deMinutos, minutosDesde, ErrorNegocio };
