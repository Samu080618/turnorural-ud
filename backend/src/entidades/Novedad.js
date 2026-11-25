'use strict';
const ConexionBD = require('../datos/ConexionBD');
const TIPOS = ['MedicoNoAsiste', 'CierrePuesto', 'Retraso', 'Otra'];
const CANCELAN = ['MedicoNoAsiste', 'CierrePuesto'];
/** Novedad de una jornada (Sprint 3, HU-0305). */
class Novedad {
  static cancelaJornada(tipo) { return CANCELAN.includes(tipo); }
  static async registrar(d, ahora, cx) {
    const r = await ConexionBD.obtener().ejecutar(
      `INSERT INTO novedad (id_jornada, id_encargado, tipo, descripcion, minutos_retraso, fecha_registro) VALUES (?, ?, ?, ?, ?, ?)`,
      [d.idJornada, d.idEncargado, d.tipo, d.descripcion, d.minutosRetraso || null, ahora], cx);
    return r.idInsertado;
  }
  static async listarPorJornada(idJornada) {
    return ConexionBD.obtener().consultar('SELECT * FROM novedad WHERE id_jornada = ? ORDER BY id_novedad DESC', [idJornada]);
  }
}
Novedad.TIPOS = TIPOS;
module.exports = Novedad;
