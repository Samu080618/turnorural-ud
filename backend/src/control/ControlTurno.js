'use strict';
const ConexionBD = require('../datos/ConexionBD');
const Jornada = require('../entidades/Jornada');
const Turno = require('../entidades/Turno');
const Paciente = require('../entidades/Paciente');
const ControlNotificacion = require('./ControlNotificacion');
const ControlJornada = require('./ControlJornada');
const { fechaISO, fechaHora, horaHM, sumarDias, aMinutos, ErrorNegocio } = require('../util');
const MOTIVOS = ['Ya no lo necesito', 'No tengo transporte', 'Me siento mejor', 'Tengo otro compromiso', 'Otro'];
const ESTADOS = ['Asignado', 'Atendido', 'NoAsistio', 'Cancelado', 'CanceladoNovedad'];

/** HU-0202 Solicitar turno, HU-0203 Consultar posición, HU-0204 Cancelar turno, HU-0205 Historial. */
class ControlTurno {
  static soloPaciente(s) { if (s.rol !== 'Paciente') throw new ErrorNegocio(403, 'ROL', 'Opción solo para pacientes'); }

  static async solicitarTurno(sesion, idJornada) {
    ControlTurno.soloPaciente(sesion);
    const hoy = fechaISO();
    const hab = await Paciente.verificarHabilitacion(sesion.idUsuario, hoy);
    if (hab.suspendido) throw new ErrorNegocio(403, 'SUSPENDIDO', `Tienes ${hab.inasistencias} inasistencias en los últimos 30 días. Podrás pedir turno desde el ${hab.hasta}`);
    const res = await ConexionBD.obtener().transaccion(async (cx) => {
      const j = await Jornada.bloquear(idJornada, cx);
      if (!j) throw new ErrorNegocio(404, 'NO_EXISTE', 'La jornada no existe');
      const fecha = String(j.fecha).slice(0, 10);
      if (j.estado !== 'Abierta') throw new ErrorNegocio(409, 'NO_ABIERTA', 'La jornada no está recibiendo solicitudes');
      if (fecha < hoy || fecha > sumarDias(hoy, 7)) throw new ErrorNegocio(409, 'FUERA_RANGO', 'Solo puedes pedir turno desde hoy hasta 7 días adelante');
      if (fecha === hoy && aMinutos(horaHM()) > aMinutos(j.hora_fin) - 60) throw new ErrorNegocio(409, 'TARDE', 'Ya no se reciben solicitudes para hoy (cierran 1 hora antes del fin de la atención)');
      if (await Turno.buscarActivoEnFecha(sesion.idUsuario, fecha, cx)) throw new ErrorNegocio(409, 'YA_TIENE', 'Ya tienes un turno asignado para ese día');
      const ocupados = await Jornada.contarCuposOcupados(idJornada, cx);
      if (ocupados >= j.cupos_totales) throw new ErrorNegocio(409, 'SIN_CUPOS', 'No quedan cupos para esta jornada');
      const numero = await Turno.siguienteNumero(idJornada, cx);
      const idTurno = await Turno.crear(idJornada, sesion.idUsuario, numero, fechaHora(), cx);
      return { idTurno };
    });
    const t = await Turno.obtener(res.idTurno);
    const hora = ControlJornada.horaEstimada(t, t.numero);
    const smsEnviado = await ControlNotificacion.notificar({
      idTurno: t.id_turno, tipo: 'Confirmacion', celular: t.celular,
      mensaje: `TurnoRural: tu turno es el No. ${t.numero} el ${String(t.fecha).slice(0, 10)} en ${t.puesto}. Hora aprox: ${hora}. Si no puedes ir, cancelalo en la app.`,
    });
    return { idTurno: t.id_turno, numero: t.numero, fecha: String(t.fecha).slice(0, 10), puesto: t.puesto, horaEstimada: hora, smsEnviado };
  }

  /** Posición en la fila: turnos Asignado con número menor; tiempo = posición x duración de consulta. */
  static async consultarPosicion(sesion, idTurno) {
    ControlTurno.soloPaciente(sesion);
    const t = await Turno.obtener(idTurno);
    if (!t || t.id_paciente !== sesion.idUsuario) throw new ErrorNegocio(404, 'NO_EXISTE', 'Turno no encontrado');
    const r = {
      idTurno: t.id_turno, numero: t.numero, estado: t.estado, estadoJornada: t.estado_jornada,
      fecha: String(t.fecha).slice(0, 10), puesto: t.puesto, horaEstimada: ControlJornada.horaEstimada(t, t.numero),
      turnosAntes: null, minutosEstimados: null, consultadoA: horaHM(),
    };
    if (t.estado === 'Asignado') {
      r.turnosAntes = await Turno.contarAntesDe(t.id_jornada, t.numero);
      r.minutosEstimados = r.turnosAntes * (t.duracion_consulta_min || 15);
    }
    const nov = await require('../entidades/Novedad').listarPorJornada(t.id_jornada);
    r.novedades = nov.map((n) => ({ tipo: n.tipo, descripcion: n.descripcion, fecha: n.fecha_registro }));
    return r;
  }

  static async consultarMisTurnos(sesion) {
    ControlTurno.soloPaciente(sesion);
    const activos = await Turno.listarActivosDelPaciente(sesion.idUsuario, fechaISO());
    const out = [];
    for (const a of activos) out.push(await ControlTurno.consultarPosicion(sesion, a.id_turno));
    return out;
  }

  static async cancelarTurno(sesion, idTurno, motivo) {
    ControlTurno.soloPaciente(sesion);
    if (!MOTIVOS.includes(motivo)) throw new ErrorNegocio(400, 'DATOS', 'Seleccione un motivo de cancelación');
    const t = await Turno.obtener(idTurno);
    if (!t || t.id_paciente !== sesion.idUsuario) throw new ErrorNegocio(404, 'NO_EXISTE', 'Turno no encontrado');
    if (t.estado !== 'Asignado') throw new ErrorNegocio(409, 'NO_CANCELABLE', 'Este turno ya no se puede cancelar');
    if (!Jornada.admiteMarcas({ estado: t.estado_jornada })) throw new ErrorNegocio(409, 'NO_CANCELABLE', 'La jornada ya fue cerrada');
    const ok = await Turno.cancelar(idTurno, motivo, fechaHora());
    if (!ok) throw new ErrorNegocio(409, 'NO_CANCELABLE', 'Este turno ya no se puede cancelar');
    const cupos = t.cupos_totales;
    return { idTurno: t.id_turno, estado: 'Cancelado', cupoLiberado: true };
  }

  static async consultarHistorial(sesion, estado, pagina) {
    ControlTurno.soloPaciente(sesion);
    if (estado && !ESTADOS.includes(estado)) throw new ErrorNegocio(400, 'DATOS', 'Estado no válido');
    const p = Math.max(1, Number(pagina) || 1);
    const desde = sumarDias(fechaISO(), -365);
    const r = await Turno.listarPorPaciente(sesion.idUsuario, desde, estado || null, p);
    return {
      pagina: p, totalPaginas: Math.max(1, Math.ceil(r.total / 10)), total: r.total,
      turnos: r.filas.map((f) => ({ ...f, fecha: String(f.fecha).slice(0, 10), hora_inicio: String(f.hora_inicio).slice(0, 5) })),
    };
  }
}
ControlTurno.MOTIVOS = MOTIVOS;
module.exports = ControlTurno;
