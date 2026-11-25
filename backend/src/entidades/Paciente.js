'use strict';
const ConexionBD = require('../datos/ConexionBD');
const { sumarDias } = require('../util');
const INASISTENCIAS_MAX = 3, VENTANA_DIAS = 30, DIAS_SUSPENSION = 7;

/** Paciente: regla de suspensión por inasistencias (RN-08). */
class Paciente {
  /** Devuelve { suspendido, hasta } según los turnos "No asistió" de los últimos 30 días. */
  static async verificarHabilitacion(idPaciente, hoy) {
    const filas = await ConexionBD.obtener().consultar(
      `SELECT j.fecha FROM turno t JOIN jornada j ON j.id_jornada = t.id_jornada
       WHERE t.id_paciente = ? AND t.estado = 'NoAsistio' AND j.fecha >= ? AND j.fecha <= ?
       ORDER BY j.fecha DESC`, [idPaciente, sumarDias(hoy, -VENTANA_DIAS), hoy]);
    if (filas.length < INASISTENCIAS_MAX) return { suspendido: false, inasistencias: filas.length };
    const hasta = sumarDias(String(filas[0].fecha).slice(0, 10), DIAS_SUSPENSION);
    return { suspendido: hoy < hasta, hasta, inasistencias: filas.length };
  }
}
module.exports = Paciente;
