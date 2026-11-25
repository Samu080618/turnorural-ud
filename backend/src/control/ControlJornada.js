'use strict';
const Jornada = require('../entidades/Jornada');
const { fechaISO, fechaHora, sumarDias, aMinutos, deMinutos, ErrorNegocio } = require('../util');
const DIAS_MAX_CREACION = 14, DIAS_VISTA_PACIENTE = 7, CUPOS_MIN = 1, CUPOS_MAX = 40;
const HORA_MIN = '06:00', HORA_MAX = '18:00';

/** HU-0501 Crear los cupos del día y HU-0201 Ver turnos disponibles. */
class ControlJornada {
  /** RN-01..RN-05 */
  static validarDatosJornada(d, hoy) {
    const err = (m) => { throw new ErrorNegocio(400, 'DATOS', m); };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '')) err('La fecha es obligatoria');
    if (d.fecha < hoy) err('No se pueden crear cupos para una fecha pasada');
    if (d.fecha > sumarDias(hoy, DIAS_MAX_CREACION)) err(`Solo se pueden crear cupos hasta ${DIAS_MAX_CREACION} días adelante`);
    if (!/^\d{2}:\d{2}$/.test(d.horaInicio || '') || !/^\d{2}:\d{2}$/.test(d.horaFin || '')) err('Las horas de inicio y fin son obligatorias');
    if (d.horaInicio < HORA_MIN || d.horaFin > HORA_MAX) err(`El horario debe estar entre ${HORA_MIN} y ${HORA_MAX}`);
    if (aMinutos(d.horaFin) - aMinutos(d.horaInicio) < 60) err('La hora de fin debe ser al menos 1 hora después de la de inicio');
    const c = Number(d.cuposTotales);
    if (!Number.isInteger(c) || c < CUPOS_MIN || c > CUPOS_MAX) err(`La cantidad de cupos debe estar entre ${CUPOS_MIN} y ${CUPOS_MAX}`);
  }

  static async crearJornada(sesion, d) {
    if (sesion.rol !== 'Encargado') throw new ErrorNegocio(403, 'ROL', 'Solo el encargado puede crear cupos');
    const hoy = fechaISO();
    ControlJornada.validarDatosJornada(d, hoy);
    const existe = await Jornada.buscarPorPuestoYFecha(sesion.idPuesto, d.fecha);
    if (existe) throw new ErrorNegocio(409, 'DUPLICADA', 'Ya existe una jornada para esa fecha en el puesto');
    const id = await Jornada.crear({ ...d, cuposTotales: Number(d.cuposTotales), idPuesto: sesion.idPuesto, idEncargado: sesion.idUsuario }, fechaHora());
    return Jornada.obtener(id);
  }

  /** Lista de jornadas de hoy a 7 días con cupos disponibles (vista del paciente). */
  static async consultarCuposDisponibles() {
    const hoy = fechaISO();
    const filas = await Jornada.listarConCupos(hoy, sumarDias(hoy, DIAS_VISTA_PACIENTE));
    return filas.map((j) => ({
      idJornada: j.id_jornada, puesto: j.puesto, fecha: String(j.fecha).slice(0, 10),
      horaInicio: String(j.hora_inicio).slice(0, 5), horaFin: String(j.hora_fin).slice(0, 5),
      cuposTotales: j.cupos_totales, cuposDisponibles: Math.max(0, Number(j.cupos_disponibles)),
      estado: j.estado, novedad: j.ultima_novedad || null,
      disponible: j.estado === 'Abierta' && Number(j.cupos_disponibles) > 0,
    }));
  }

  static async listarDelPuesto(sesion) {
    const hoy = fechaISO();
    return Jornada.listarConCupos(hoy, sumarDias(hoy, DIAS_MAX_CREACION), sesion.idPuesto);
  }
}
ControlJornada.horaEstimada = (j, numero) => deMinutos(aMinutos(j.hora_inicio) + (numero - 1) * (j.duracion_consulta_min || 15));
module.exports = ControlJornada;
