// Funciones comunes de las interfaces de TurnoRural
const MIN_INACTIVIDAD = 15;
const ESTADOS = { Asignado: 'En espera', Atendido: 'Atendido', NoAsistio: 'No llegó', Cancelado: 'Cancelado', CanceladoNovedad: 'Cancelado por novedad' };

async function api(metodo, ruta, cuerpo) {
  const r = await fetch('/api' + ruta, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, credentials: 'same-origin' });
  if (r.status === 204) return null;
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && !ruta.startsWith('/auth/login')) {
    sessionStorage.clear();
    location.href = '/index.html?motivo=' + (datos.codigo === 'SESION_EXPIRADA' ? 'inactividad' : 'sesion');
    throw new Error(datos.mensaje);
  }
  if (!r.ok) { const e = new Error(datos.mensaje || 'Error'); e.codigo = datos.codigo; e.status = r.status; throw e; }
  return datos;
}
function mostrar(id, texto, tipo = 'ok') { const m = document.getElementById(id); m.className = 'msg ' + tipo; m.textContent = texto; }
function ocultar(id) { document.getElementById(id).className = 'msg'; }
function chip(e) { return `<span class="chip ${e}">${ESTADOS[e] || e}</span>`; }
function fechaLarga(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** HU-0105 corregida: cierre manual con confirmación y cierre por inactividad desde la página abierta. */
function iniciarSesionSegura(rolEsperado) {
  let temporizador;
  const reiniciar = () => { clearTimeout(temporizador); temporizador = setTimeout(cerrarPorInactividad, MIN_INACTIVIDAD * 60000); };
  ['click', 'keydown', 'touchstart', 'scroll'].forEach((ev) => document.addEventListener(ev, reiniciar, { passive: true }));
  reiniciar();
  const btn = document.getElementById('btnSalir');
  if (btn) btn.addEventListener('click', () => {
    if (!confirm('¿Deseas cerrar tu sesión?')) return;
    api('POST', '/auth/logout').finally(() => { sessionStorage.clear(); location.href = '/index.html?motivo=salida'; });
  });
  return api('GET', '/auth/yo').then((s) => {
    if (rolEsperado && s.rol !== rolEsperado) location.href = s.rol === 'Paciente' ? '/paciente/' : '/encargado/';
    const n = document.getElementById('nombreUsuario'); if (n) n.textContent = s.nombres;
    return s;
  });
}
async function cerrarPorInactividad() {
  try { await api('POST', '/auth/logout', { motivo: 'inactividad' }); } catch (e) { /* ya cerrada */ }
  sessionStorage.clear();
  document.body.innerHTML = '';
  location.href = '/index.html?motivo=inactividad';
}
