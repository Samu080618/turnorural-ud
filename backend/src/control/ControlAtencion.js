'use strict';
const ConexionBD = require('../datos/ConexionBD');
const Jornada = require('../entidades/Jornada');
const Turno = require('../entidades/Turno');
const ControlJornada = require('./ControlJornada');
const { fechaISO, fechaHora, minutosDesde, ErrorNegocio } = require('../util');
const MINUTOS_CORRECCION = 10;

/** Módulo 03: HU-0301 Lista del día, HU-0302 Atendido, HU-0303 No llegó, HU-0304 Cerrar jornada. */
class ControlAtencion {
  static soloEncargado(s) { if (s.rol !== 'Encargado') throw new ErrorNegocio(403, 'ROL', 'Opción solo para el encargado'); }

  static async jornadaDeHoy(sesion) {
    const j = await Jornada.buscarPorPuestoYFecha(sesion.idPuesto, fechaISO());
    if (!j) throw new ErrorNegocio(404, 'SIN_JORNADA', 'No hay jornada creada para hoy');
    return Jornada.obtener(j.id_jornada);
  }

  static async consultarListaDelDia(sesion, estado, documento) {
    ControlAtencion.soloEncargado(sesion);
    const j = await ControlAtencion.jornadaDeHoy(sesion);
    if (documento && !/^\d{1,15}$/.test(documento)) throw new ErrorNegocio(400, 'DATOS', 'El documento solo admite números');
    const turnos = await Turno.listarPorJornada(j.id_jornada, estado || null, documento || null);
    const conteo = await Turno.contarPorEstado(j.id_jornada);
    const siguiente = (await Turno.listarAsignados(j.id_jornada))[0] || null;
    return {
      jornada: { idJornada: j.id_jornada, fecha: String(j.fecha).slice(0, 10), horaInicio: String(j.hora_inicio).slice(0, 5), horaFin: String(j.hora_fin).slice(0, 5), estado: j.estado, cuposTotales: j.cupos_totales, puesto: j.puesto },
      conteo, siguienteNumero: siguiente ? siguiente.numero : null,
      turnos: turnos.map((t) => ({ ...t, horaEstimada: ControlJornada.horaEstimada(j, t.numero),
        corregible: ['Atendido', 'NoAsistio'].includes(t.estado) && t.fecha_marca && minutosDesde(t.fecha_marca) <= MINUTOS_CORRECCION && Jornada.admiteMarcas(j) })),
    };
  }

  static async validarTurnoDeHoy(sesion, idTurno) {
    const t = await Turno.obtener(idTurno);
    if (!t || t.id_puesto !== sesion.idPuesto) throw new ErrorNegocio(404, 'NO_EXISTE', 'Turno no encontrado');
    if (String(t.fecha).slice(0, 10) !== fechaISO()) throw new ErrorNegocio(409, 'NO_ES_HOY', 'Solo se pueden marcar turnos de la jornada de hoy');
    if (!Jornada.admiteMarcas({ estado: t.estado_jornada })) throw new ErrorNegocio(409, 'JORNADA_CERRADA', 'La jornada está cerrada o cancelada');
    return t;
  }

  /** estado: 'Atendido' (HU-0302) o 'NoAsistio' (HU-0303) */
  static async marcarTurno(sesion, idTurno, estado) {
    ControlAtencion.soloEncargado(sesion);
    if (!['Atendido', 'NoAsistio'].includes(estado)) throw new ErrorNegocio(400, 'DATOS', 'Marca no válida');
    const t = await ControlAtencion.validarTurnoDeHoy(sesion, idTurno);
    if (t.estado !== 'Asignado') throw new ErrorNegocio(409, 'YA_MARCADO', 'El turno ya no está en espera');
    await ConexionBD.obtener().transaccion(async (cx) => {
      const ok = await Turno.marcar(idTurno, estado, sesion.idUsuario, fechaHora(), cx);
      if (!ok) throw new ErrorNegocio(409, 'YA_MARCADO', 'El turno ya no está en espera');
      if (t.estado_jornada === 'Abierta') await Jornada.cambiarEstado(t.id_jornada, 'EnAtencion', null, cx);
    });
    return { idTurno: Number(idTurno), numero: t.numero, estado };
  }

  /** Deshacer una marca dentro de los 10 minutos siguientes (corrección de errores). */
  static async corregirMarca(sesion, idTurno) {
    ControlAtencion.soloEncargado(sesion);
    const t = await ControlAtencion.validarTurnoDeHoy(sesion, idTurno);
    if (!['Atendido', 'NoAsistio'].includes(t.estado)) throw new ErrorNegocio(409, 'SIN_MARCA', 'El turno no tiene una marca para corregir');
    if (minutosDesde(t.fecha_marca) > MINUTOS_CORRECCION) throw new ErrorNegocio(409, 'FUERA_DE_TIEMPO', 'Solo se puede corregir durante los 10 minutos siguientes a la marca');
    await Turno.revertirMarca(idTurno);
    return { idTurno: Number(idTurno), numero: t.numero, estado: 'Asignado' };
  }

  static async resumenCierre(sesion) {
    ControlAtencion.soloEncargado(sesion);
    const j = await ControlAtencion.jornadaDeHoy(sesion);
    return { idJornada: j.id_jornada, estado: j.estado, conteo: await Turno.contarPorEstado(j.id_jornada) };
  }

  static async cerrarJornada(sesion, idJornada, confirmar) {
    ControlAtencion.soloEncargado(sesion);
    const j = await Jornada.obtener(idJornada);
    if (!j || j.id_puesto !== sesion.idPuesto) throw new ErrorNegocio(404, 'NO_EXISTE', 'Jornada no encontrada');
    if (!Jornada.admiteMarcas(j)) throw new ErrorNegocio(409, 'JORNADA_CERRADA', 'La jornada ya está cerrada o cancelada');
    if (String(j.fecha).slice(0, 10) > fechaISO()) throw new ErrorNegocio(409, 'FUTURA', 'No se puede cerrar una jornada futura');
    if (confirmar !== true) throw new ErrorNegocio(400, 'CONFIRMAR', 'Debe confirmar el cierre');
    const ahora = fechaHora();
    const marcados = await ConexionBD.obtener().transaccion(async (cx) => {
      const n = await Turno.marcarPendientesNoAsistio(idJornada, sesion.idUsuario, ahora, cx);
      await Jornada.cambiarEstado(idJornada, 'Cerrada', ahora, cx);
      return n;
    });
    return { idJornada: Number(idJornada), estado: 'Cerrada', pendientesMarcadosNoAsistio: marcados, conteo: await Turno.contarPorEstado(idJornada) };
  }
}
module.exports = ControlAtencion;
