'use strict';
const Usuario = require('../entidades/Usuario');
const { ErrorNegocio } = require('../util');

/** Control de la edición del perfil (HU-0104, CU-04). */
class ControlPerfil {
  /** CA1: documento, rol, nombres, apellidos, celular y, para el paciente, la vereda. */
  static async consultar(sesion) {
    const u = await Usuario.buscarPorId(sesion.idUsuario);
    const p = { tipoDocumento: u.tipo_documento, numeroDocumento: u.numero_documento, rol: u.rol, nombres: u.nombres, apellidos: u.apellidos, celular: u.celular };
    if (u.rol === 'Paciente') p.vereda = u.vereda;
    return p;
  }

  /** CA2, CA3 y CA4: solo se editan nombres, apellidos, celular y vereda. */
  static async actualizar(sesion, d) {
    const limpio = (v) => String(v ?? '').trim();
    const datos = { nombres: limpio(d.nombres), apellidos: limpio(d.apellidos), celular: limpio(d.celular), vereda: limpio(d.vereda) };
    if (!datos.nombres || !datos.apellidos) throw new ErrorNegocio(400, 'DATOS', 'Nombres y apellidos son obligatorios');
    if (datos.nombres.length > 50 || datos.apellidos.length > 50) throw new ErrorNegocio(400, 'DATOS', 'Nombres y apellidos admiten máximo 50 caracteres');
    if (!/^3\d{9}$/.test(datos.celular)) throw new ErrorNegocio(400, 'DATOS', 'El celular debe tener 10 dígitos y empezar por 3');
    const esPaciente = sesion.rol === 'Paciente';
    if (esPaciente && (!datos.vereda || datos.vereda.length > 60)) throw new ErrorNegocio(400, 'DATOS', 'Indique su vereda o sector (máximo 60 caracteres)');
    await Usuario.actualizarPerfil(sesion.idUsuario, datos, esPaciente);
    return { mensaje: 'Los cambios se guardaron', perfil: await ControlPerfil.consultar(sesion) };
  }
}
module.exports = ControlPerfil;
