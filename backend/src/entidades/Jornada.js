'use strict';
const ConexionBD = require('../datos/ConexionBD');
const bd = () => ConexionBD.obtener();
/** Estados que ocupan cupo */
const OCUPAN = "('Asignado','Atendido','NoAsistio')";

/** Jornada: día de atención de un puesto con N cupos.
 * Estados: Abierta -> EnAtencion -> Cerrada ; Abierta|EnAtencion -> Cancelada (novedad). */
class Jornada {
  static async crear(d, ahora) {
    const r = await bd().ejecutar(
      `INSERT INTO jornada (id_puesto, id_encargado, fecha, hora_inicio, hora_fin, cupos_totales, estado, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, 'Abierta', ?)`,
      [d.idPuesto, d.idEncargado, d.fecha, d.horaInicio, d.horaFin, d.cuposTotales, ahora]);
    return r.idInsertado;
  }

  static async buscarPorPuestoYFecha(idPuesto, fecha) {
    const f = await bd().consultar('SELECT * FROM jornada WHERE id_puesto = ? AND fecha = ?', [idPuesto, fecha]);
    return f[0] || null;
  }

  /** Jornadas de [desde, hasta] con los cupos disponibles calculados. */
  static async listarConCupos(desde, hasta, idPuesto = null) {
    const params = [desde, hasta];
    let filtro = '';
    if (idPuesto) { filtro = ' AND j.id_puesto = ?'; params.push(idPuesto); }
    return bd().consultar(
      `SELECT j.*, p.nombre AS puesto, p.duracion_consulta_min,
         j.cupos_totales - (SELECT COUNT(*) FROM turno t WHERE t.id_jornada = j.id_jornada AND t.estado IN ${OCUPAN}) AS cupos_disponibles,
         (SELECT n.descripcion FROM novedad n WHERE n.id_jornada = j.id_jornada ORDER BY n.id_novedad DESC LIMIT 1) AS ultima_novedad
       FROM jornada j JOIN puesto_salud p ON p.id_puesto = j.id_puesto
       WHERE j.fecha >= ? AND j.fecha <= ?${filtro}
       ORDER BY j.fecha, p.nombre`, params);
  }

  static async obtener(idJornada, cx = null) {
    const f = await bd().consultar(
      `SELECT j.*, p.nombre AS puesto, p.duracion_consulta_min FROM jornada j JOIN puesto_salud p ON p.id_puesto = j.id_puesto
       WHERE j.id_jornada = ?`, [idJornada], cx);
    return f[0] || null;
  }

  /** Lee la jornada con bloqueo de fila (SELECT ... FOR UPDATE) dentro de una transacción. */
  static async bloquear(idJornada, cx) {
    const f = await bd().consultar('SELECT * FROM jornada WHERE id_jornada = ? FOR UPDATE', [idJornada], cx);
    return f[0] || null;
  }

  static async contarCuposOcupados(idJornada, cx = null) {
    const f = await bd().consultar(`SELECT COUNT(*) AS n FROM turno WHERE id_jornada = ? AND estado IN ${OCUPAN}`, [idJornada], cx);
    return Number(f[0].n);
  }

  static async cambiarEstado(idJornada, estado, ahora = null, cx = null) {
    const extra = estado === 'Cerrada' || estado === 'Cancelada' ? ', fecha_cierre = ?' : '';
    const params = extra ? [estado, ahora, idJornada] : [estado, idJornada];
    await bd().ejecutar(`UPDATE jornada SET estado = ?${extra} WHERE id_jornada = ?`, params, cx);
  }

  static admiteMarcas(j) { return j.estado === 'Abierta' || j.estado === 'EnAtencion'; }
}
module.exports = Jornada;
