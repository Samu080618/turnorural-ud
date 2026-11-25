'use strict';
const ConexionBD = require('../datos/ConexionBD');
/** Registro de cada SMS enviado a un paciente. Estados: Pendiente -> Enviada | Fallida */
class NotificacionSMS {
  static async registrar(d) {
    const r = await ConexionBD.obtener().ejecutar(
      `INSERT INTO notificacion_sms (id_turno, id_novedad, tipo, celular, mensaje, estado, intentos) VALUES (?, ?, ?, ?, ?, 'Pendiente', 0)`,
      [d.idTurno, d.idNovedad || null, d.tipo, d.celular, d.mensaje.slice(0, 160)]);
    return r.idInsertado;
  }
  static async actualizarResultado(idNotificacion, estado, intentos, ahora) {
    await ConexionBD.obtener().ejecutar('UPDATE notificacion_sms SET estado = ?, intentos = ?, fecha_envio = ? WHERE id_notificacion = ?',
      [estado, intentos, ahora, idNotificacion]);
  }
}
module.exports = NotificacionSMS;
