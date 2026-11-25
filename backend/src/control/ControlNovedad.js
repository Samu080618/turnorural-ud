'use strict';
const ConexionBD = require('../datos/ConexionBD');
const Jornada = require('../entidades/Jornada');
const Turno = require('../entidades/Turno');
const Novedad = require('../entidades/Novedad');
const ControlNotificacion = require('./ControlNotificacion');
const { fechaISO, fechaHora, ErrorNegocio } = require('../util');

/** HU-0305 Reportar una novedad y avisar por SMS a los pacientes con turno. */
class ControlNovedad {
  static validar(d) {
    const err = (m) => { throw new ErrorNegocio(400, 'DATOS', m); };
    if (!Novedad.TIPOS.includes(d.tipo)) err('Seleccione el tipo de novedad');
    const desc = (d.descripcion || '').trim();
    if (desc.length < 10 || desc.length > 300) err('La descripción debe tener entre 10 y 300 caracteres');
    if (d.tipo === 'Retraso') {
      const m = Number(d.minutosRetraso);
      if (!Number.isInteger(m) || m < 15 || m > 240) err('El retraso debe estar entre 15 y 240 minutos');
    }
  }

  static mensajeSMS(tipo, j, numero, d) {
    const f = String(j.fecha).slice(0, 10);
    if (tipo === 'MedicoNoAsiste') return `TurnoRural: tu turno No. ${numero} del ${f} fue cancelado porque el medico no podra atender. Puedes pedir otro turno en la app.`;
    if (tipo === 'CierrePuesto') return `TurnoRural: el puesto ${j.puesto} no atendera el ${f}. Tu turno No. ${numero} fue cancelado. Pide otro turno en la app.`;
    if (tipo === 'Retraso') return `TurnoRural: la atencion del ${f} se retrasa ${d.minutosRetraso} min. Tu turno No. ${numero} sigue activo.`;
    return `TurnoRural: aviso sobre tu turno No. ${numero} del ${f}: ${d.descripcion}`.slice(0, 160);
  }

  static async reportarNovedad(sesion, d) {
    if (sesion.rol !== 'Encargado') throw new ErrorNegocio(403, 'ROL', 'Opción solo para el encargado');
    ControlNovedad.validar(d);
    const j = await Jornada.obtener(d.idJornada);
    if (!j || j.id_puesto !== sesion.idPuesto) throw new ErrorNegocio(404, 'NO_EXISTE', 'Jornada no encontrada');
    if (!Jornada.admiteMarcas(j)) throw new ErrorNegocio(409, 'JORNADA_CERRADA', 'La jornada está cerrada o cancelada');
    if (String(j.fecha).slice(0, 10) < fechaISO()) throw new ErrorNegocio(409, 'PASADA', 'No se pueden reportar novedades de jornadas pasadas');
    const ahora = fechaHora();
    const cancela = Novedad.cancelaJornada(d.tipo);
    const { idNovedad, afectados } = await ConexionBD.obtener().transaccion(async (cx) => {
      const afectados = await Turno.listarAsignados(j.id_jornada, cx);
      const idNovedad = await Novedad.registrar({ ...d, descripcion: d.descripcion.trim(), idJornada: j.id_jornada, idEncargado: sesion.idUsuario }, ahora, cx);
      if (cancela) {
        await Turno.cancelarPorNovedad(j.id_jornada, ahora, cx);
        await Jornada.cambiarEstado(j.id_jornada, 'Cancelada', ahora, cx);
      }
      return { idNovedad, afectados };
    });
    let enviados = 0;
    for (const t of afectados) {
      const ok = await ControlNotificacion.notificar({ idTurno: t.id_turno, idNovedad, tipo: 'Novedad', celular: t.celular, mensaje: ControlNovedad.mensajeSMS(d.tipo, j, t.numero, d) });
      if (ok) enviados++;
    }
    return { idNovedad, jornadaCancelada: cancela, turnosAfectados: afectados.length, smsEnviados: enviados, smsFallidos: afectados.length - enviados };
  }
}
module.exports = ControlNovedad;
