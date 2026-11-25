'use strict';
const ConexionBD = require('../datos/ConexionBD');
class PuestoSalud {
  static async listar() {
    return ConexionBD.obtener().consultar('SELECT id_puesto, nombre, municipio, duracion_consulta_min FROM puesto_salud ORDER BY nombre');
  }
  static async obtener(idPuesto) {
    const f = await ConexionBD.obtener().consultar('SELECT * FROM puesto_salud WHERE id_puesto = ?', [idPuesto]);
    return f[0] || null;
  }
}
module.exports = PuestoSalud;
