'use strict';
const ServicioSMS = require('../servicios/ServicioSMS');
const NotificacionSMS = require('../entidades/NotificacionSMS');
const { fechaHora } = require('../util');
const INTENTOS_MAX = 2;

/** Envía un SMS a un paciente, con un reintento, y deja registro del resultado. */
class ControlNotificacion {
  static async notificar({ idTurno, idNovedad, tipo, celular, mensaje }) {
    const id = await NotificacionSMS.registrar({ idTurno, idNovedad, tipo, celular, mensaje });
    let intentos = 0, enviado = false;
    while (!enviado && intentos < INTENTOS_MAX) {
      intentos++;
      try { enviado = await ServicioSMS.enviar(celular, mensaje); } catch (e) { enviado = false; }
    }
    await NotificacionSMS.actualizarResultado(id, enviado ? 'Enviada' : 'Fallida', intentos, fechaHora());
    return enviado;
  }
}
module.exports = ControlNotificacion;
