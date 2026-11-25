'use strict';
process.env.DB_DRIVER = 'sqlite';
process.env.NODE_ENV = 'test';
const util = require('../src/util');
const ConexionBD = require('../src/datos/ConexionBD');
const ServicioSMS = require('../src/servicios/ServicioSMS');
const crearApp = require('../src/app');
const { sembrar } = require('../src/semilla');

/** Reloj fijo: lunes 23/11/2026 09:00 (hora de Colombia) */
function fijarHora(iso) { const d = new Date(iso); util.reloj.ahora = () => new Date(d); }

async function entorno({ hora = '2026-11-23T09:00:00', conTurnos = true } = {}) {
  fijarHora(hora);
  ConexionBD.reiniciar();
  await ConexionBD.obtener().conectar();
  await sembrar({ conTurnos });
  ServicioSMS.bandeja.length = 0;
  const srv = crearApp().listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  return { srv, base, cerrar: async () => { srv.close(); await ConexionBD.obtener().cerrar(); } };
}

/** Cliente HTTP con su propia cookie de sesión */
function cliente(base) {
  let cookie = '';
  const pedir = async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text();
    return { status: r.status, body: t ? JSON.parse(t) : null };
  };
  return {
    pedir,
    entrar: (doc) => pedir('POST', '/auth/login', { numeroDocumento: doc, contrasena: 'Clave2026' }),
  };
}
const DOC = { encargada: '1010101010', ana: '1020304050', jose: '1030405060', maria: '1040506070', pedro: '1050607080', rosa: '1060708090' };
module.exports = { entorno, cliente, fijarHora, DOC, ServicioSMS, ConexionBD, util };
