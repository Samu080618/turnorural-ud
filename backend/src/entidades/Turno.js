'use strict';
const ConexionBD = require('../datos/ConexionBD');
const bd = () => ConexionBD.obtener();

/** Turno: número asignado a un paciente en una jornada.
 * Estados: Asignado -> Atendido | NoAsistio | Cancelado | CanceladoNovedad */
class Turno {
  static async siguienteNumero(idJornada, cx) {
    const f = await bd().consultar('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM turno WHERE id_jornada = ?', [idJornada], cx);
    return Number(f[0].n);
  }

  static async crear(idJornada, idPaciente, numero, ahora, cx) {
    const r = await bd().ejecutar(
      `INSERT INTO turno (id_jornada, id_paciente, numero, estado, fecha_solicitud) VALUES (?, ?, ?, 'Asignado', ?)`,
      [idJornada, idPaciente, numero, ahora], cx);
    return r.idInsertado;
  }

  /** Turno activo (Asignado) del paciente en una fecha. */
  static async buscarActivoEnFecha(idPaciente, fecha, cx = null) {
    const f = await bd().consultar(
      `SELECT t.* FROM turno t JOIN jornada j ON j.id_jornada = t.id_jornada
       WHERE t.id_paciente = ? AND j.fecha = ? AND t.estado = 'Asignado'`, [idPaciente, fecha], cx);
    return f[0] || null;
  }

  static async obtener(idTurno, cx = null) {
    const f = await bd().consultar(
      `SELECT t.*, j.fecha, j.hora_inicio, j.hora_fin, j.estado AS estado_jornada, j.id_puesto, p.nombre AS puesto,
              p.duracion_consulta_min, pf.celular, pf.nombres, pf.apellidos
       FROM turno t JOIN jornada j ON j.id_jornada = t.id_jornada JOIN puesto_salud p ON p.id_puesto = j.id_puesto
       JOIN perfil pf ON pf.id_usuario = t.id_paciente WHERE t.id_turno = ?`, [idTurno], cx);
    return f[0] || null;
  }

  /** Turnos activos del paciente desde hoy (para "Mi turno"). */
  static async listarActivosDelPaciente(idPaciente, hoy) {
    return bd().consultar(
      `SELECT t.id_turno FROM turno t JOIN jornada j ON j.id_jornada = t.id_jornada
       WHERE t.id_paciente = ? AND j.fecha >= ? AND t.estado IN ('Asignado','CanceladoNovedad')
       ORDER BY j.fecha, t.numero`, [idPaciente, hoy]);
  }

  /** Cantidad de turnos Asignado con número menor (posición en la fila). */
  static async contarAntesDe(idJornada, numero) {
    const f = await bd().consultar(
      "SELECT COUNT(*) AS n FROM turno WHERE id_jornada = ? AND estado = 'Asignado' AND numero < ?", [idJornada, numero]);
    return Number(f[0].n);
  }

  static async cancelar(idTurno, motivo, ahora) {
    const r = await bd().ejecutar(
      `UPDATE turno SET estado = 'Cancelado', fecha_cancelacion = ?, motivo_cancelacion = ? WHERE id_turno = ? AND estado = 'Asignado'`,
      [ahora, motivo, idTurno]);
    return r.filasAfectadas === 1;
  }

  static async listarPorPaciente(idPaciente, desde, estado, pagina, tam = 10) {
    const params = [idPaciente, desde];
    let filtro = '';
    if (estado) { filtro = ' AND t.estado = ?'; params.push(estado); }
    const total = await bd().consultar(
      `SELECT COUNT(*) AS n FROM turno t JOIN jornada j ON j.id_jornada = t.id_jornada WHERE t.id_paciente = ? AND j.fecha >= ?${filtro}`, params);
    const filas = await bd().consultar(
      `SELECT t.id_turno, t.numero, t.estado, t.motivo_cancelacion, j.fecha, j.hora_inicio, p.nombre AS puesto,
         (SELECT n.descripcion FROM novedad n WHERE n.id_jornada = j.id_jornada ORDER BY n.id_novedad DESC LIMIT 1) AS novedad
       FROM turno t JOIN jornada j ON j.id_jornada = t.id_jornada JOIN puesto_salud p ON p.id_puesto = j.id_puesto
       WHERE t.id_paciente = ? AND j.fecha >= ?${filtro}
       ORDER BY j.fecha DESC, t.numero DESC LIMIT ? OFFSET ?`, [...params, tam, (pagina - 1) * tam]);
    return { total: Number(total[0].n), filas };
  }

  // ------------------------------------------------------------------ Sprint 3
  static async listarPorJornada(idJornada, estado = null, documento = null) {
    const params = [idJornada];
    let filtro = '';
    if (estado) { filtro += ' AND t.estado = ?'; params.push(estado); }
    if (documento) { filtro += ' AND u.numero_documento LIKE ?'; params.push(documento + '%'); }
    return bd().consultar(
      `SELECT t.id_turno, t.numero, t.estado, t.fecha_marca, u.numero_documento, pf.nombres, pf.apellidos, pf.celular, pa.vereda
       FROM turno t JOIN usuario u ON u.id_usuario = t.id_paciente JOIN perfil pf ON pf.id_usuario = t.id_paciente
       JOIN paciente pa ON pa.id_usuario = t.id_paciente
       WHERE t.id_jornada = ?${filtro} ORDER BY t.numero`, params);
  }

  static async contarPorEstado(idJornada) {
    const f = await bd().consultar('SELECT estado, COUNT(*) AS n FROM turno WHERE id_jornada = ? GROUP BY estado', [idJornada]);
    const r = { Asignado: 0, Atendido: 0, NoAsistio: 0, Cancelado: 0, CanceladoNovedad: 0 };
    f.forEach((x) => { r[x.estado] = Number(x.n); });
    return r;
  }

  /** Marca Atendido o NoAsistio un turno que esté Asignado. */
  static async marcar(idTurno, estado, idEncargado, ahora, cx = null) {
    const r = await bd().ejecutar(
      "UPDATE turno SET estado = ?, fecha_marca = ?, id_encargado_marca = ? WHERE id_turno = ? AND estado = 'Asignado'",
      [estado, ahora, idEncargado, idTurno], cx);
    return r.filasAfectadas === 1;
  }

  /** Deshace una marca (vuelve a Asignado). */
  static async revertirMarca(idTurno) {
    const r = await bd().ejecutar(
      "UPDATE turno SET estado = 'Asignado', fecha_marca = NULL, id_encargado_marca = NULL WHERE id_turno = ? AND estado IN ('Atendido','NoAsistio')",
      [idTurno]);
    return r.filasAfectadas === 1;
  }

  static async marcarPendientesNoAsistio(idJornada, idEncargado, ahora, cx) {
    const r = await bd().ejecutar(
      "UPDATE turno SET estado = 'NoAsistio', fecha_marca = ?, id_encargado_marca = ? WHERE id_jornada = ? AND estado = 'Asignado'",
      [ahora, idEncargado, idJornada], cx);
    return r.filasAfectadas;
  }

  static async listarAsignados(idJornada, cx = null) {
    return bd().consultar(
      `SELECT t.id_turno, t.numero, pf.celular FROM turno t JOIN perfil pf ON pf.id_usuario = t.id_paciente
       WHERE t.id_jornada = ? AND t.estado = 'Asignado' ORDER BY t.numero`, [idJornada], cx);
  }

  static async cancelarPorNovedad(idJornada, ahora, cx) {
    const r = await bd().ejecutar(
      "UPDATE turno SET estado = 'CanceladoNovedad', fecha_cancelacion = ? WHERE id_jornada = ? AND estado = 'Asignado'",
      [ahora, idJornada], cx);
    return r.filasAfectadas;
  }
}
module.exports = Turno;
