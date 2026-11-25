'use strict';
const crypto = require('crypto');
const ConexionBD = require('../datos/ConexionBD');
const bd = () => ConexionBD.obtener();
const MINUTOS_INACTIVIDAD = 15;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

/** Sesion: estados activa -> cerrada (por el usuario) | expirada (por inactividad). */
class Sesion {
  static async crear(idUsuario, ahora) {
    const token = crypto.randomBytes(32).toString('hex');
    await bd().ejecutar(`INSERT INTO sesion (id_usuario, token_hash, fecha_inicio, ultima_actividad, estado)
      VALUES (?, ?, ?, ?, 'activa')`, [idUsuario, hash(token), ahora, ahora]);
    return token;
  }
  static async buscarPorToken(token) {
    const f = await bd().consultar('SELECT * FROM sesion WHERE token_hash = ?', [hash(token || '')]);
    return f[0] || null;
  }
  static estaVencida(sesion, minutosSinUso) { return minutosSinUso >= MINUTOS_INACTIVIDAD; }
  static async registrarActividad(idSesion, ahora) {
    await bd().ejecutar('UPDATE sesion SET ultima_actividad = ? WHERE id_sesion = ?', [ahora, idSesion]);
  }
  static async finalizar(idSesion, estado, ahora) {
    await bd().ejecutar("UPDATE sesion SET estado = ?, fecha_fin = ? WHERE id_sesion = ? AND estado = 'activa'", [estado, ahora, idSesion]);
  }
}
Sesion.MINUTOS_INACTIVIDAD = MINUTOS_INACTIVIDAD;
module.exports = Sesion;
