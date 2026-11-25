'use strict';
const ConexionBD = require('../datos/ConexionBD');
const bd = () => ConexionBD.obtener();

/** CodigoRecuperacion (HU-0103): código de 6 dígitos, vence a los 10 minutos y se anula al tercer intento fallido. */
class CodigoRecuperacion {
  static async anularPendientes(idUsuario) {
    await bd().ejecutar('UPDATE codigo_recuperacion SET usado = 1 WHERE id_usuario = ? AND usado = 0', [idUsuario]);
  }
  static async crear(idUsuario, codigoHash, fechaExpiracion) {
    await bd().ejecutar('INSERT INTO codigo_recuperacion (id_usuario, codigo_hash, fecha_expiracion, intentos, usado) VALUES (?, ?, ?, 0, 0)',
      [idUsuario, codigoHash, fechaExpiracion]);
  }
  static async obtenerVigente(idUsuario) {
    const f = await bd().consultar('SELECT * FROM codigo_recuperacion WHERE id_usuario = ? AND usado = 0 ORDER BY id_codigo DESC', [idUsuario]);
    return f[0] || null;
  }
  static async registrarIntento(idCodigo, intentos, anular) {
    await bd().ejecutar('UPDATE codigo_recuperacion SET intentos = ?, usado = ? WHERE id_codigo = ?', [intentos, anular ? 1 : 0, idCodigo]);
  }
  static async marcarUsado(idCodigo) {
    await bd().ejecutar('UPDATE codigo_recuperacion SET usado = 1 WHERE id_codigo = ?', [idCodigo]);
  }
}
CodigoRecuperacion.MINUTOS_VIGENCIA = 10;
CodigoRecuperacion.MAX_INTENTOS = 3;
module.exports = CodigoRecuperacion;
