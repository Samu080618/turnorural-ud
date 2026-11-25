'use strict';
const ConexionBD = require('../datos/ConexionBD');
const bd = () => ConexionBD.obtener();

/** Usuario (Módulo 01). Paciente y Encargado heredan de Usuario. */
class Usuario {
  constructor(f) { Object.assign(this, f); }

  static async buscarPorDocumento(numeroDocumento) {
    const f = await bd().consultar(
      `SELECT u.*, p.nombres, p.apellidos, p.celular FROM usuario u JOIN perfil p ON p.id_usuario = u.id_usuario
       WHERE u.numero_documento = ?`, [numeroDocumento]);
    return f[0] ? new Usuario(f[0]) : null;
  }

  static async buscarPorId(idUsuario) {
    const f = await bd().consultar(
      `SELECT u.*, p.nombres, p.apellidos, p.celular, e.id_puesto, pa.vereda
       FROM usuario u JOIN perfil p ON p.id_usuario = u.id_usuario
       LEFT JOIN encargado e ON e.id_usuario = u.id_usuario
       LEFT JOIN paciente pa ON pa.id_usuario = u.id_usuario
       WHERE u.id_usuario = ?`, [idUsuario]);
    return f[0] ? new Usuario(f[0]) : null;
  }

  /** Crea usuario, perfil, credencial y la fila de paciente o encargado. */
  static async registrar(d, hashContrasena, ahora) {
    return bd().transaccion(async (cx) => {
      const { idInsertado: id } = await bd().ejecutar(
        `INSERT INTO usuario (tipo_documento, numero_documento, rol, activo, fecha_registro, fecha_autorizacion_datos)
         VALUES (?, ?, ?, 1, ?, ?)`, [d.tipoDocumento, d.numeroDocumento, d.rol, ahora, ahora], cx);
      await bd().ejecutar('INSERT INTO perfil (id_usuario, nombres, apellidos, celular) VALUES (?, ?, ?, ?)',
        [id, d.nombres, d.apellidos, d.celular], cx);
      await bd().ejecutar('INSERT INTO credencial (id_usuario, hash_contrasena, intentos_fallidos, fecha_ultimo_cambio) VALUES (?, ?, 0, ?)',
        [id, hashContrasena, ahora], cx);
      if (d.rol === 'Paciente') await bd().ejecutar('INSERT INTO paciente (id_usuario, vereda) VALUES (?, ?)', [id, d.vereda], cx);
      else await bd().ejecutar('INSERT INTO encargado (id_usuario, id_puesto, cargo) VALUES (?, ?, ?)', [id, d.idPuesto, d.cargo || 'Recepción'], cx);
      return id;
    });
  }

  static async obtenerCredencial(idUsuario) {
    const f = await bd().consultar('SELECT * FROM credencial WHERE id_usuario = ?', [idUsuario]);
    return f[0] || null;
  }

  static async actualizarIntentos(idUsuario, intentos, bloqueadoHasta) {
    await bd().ejecutar('UPDATE credencial SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id_usuario = ?',
      [intentos, bloqueadoHasta, idUsuario]);
  }

  static async registrarAcceso(idUsuario, evento, fechaHora, ip) {
    await bd().ejecutar('INSERT INTO registro_acceso (id_usuario, evento, fecha_hora, direccion_ip) VALUES (?, ?, ?, ?)',
      [idUsuario, evento, fechaHora, ip || null]);
  }
  /** HU-0104: actualiza los datos editables del perfil (documento y rol no se modifican). */
  static async actualizarPerfil(idUsuario, d, esPaciente) {
    return bd().transaccion(async (cx) => {
      await bd().ejecutar('UPDATE perfil SET nombres = ?, apellidos = ?, celular = ? WHERE id_usuario = ?', [d.nombres, d.apellidos, d.celular, idUsuario], cx);
      if (esPaciente) await bd().ejecutar('UPDATE paciente SET vereda = ? WHERE id_usuario = ?', [d.vereda, idUsuario], cx);
    });
  }

  /** HU-0103: guarda la nueva contraseña cifrada y desbloquea la cuenta. */
  static async cambiarContrasena(idUsuario, hashContrasena, ahora) {
    await bd().ejecutar('UPDATE credencial SET hash_contrasena = ?, intentos_fallidos = 0, bloqueado_hasta = NULL, fecha_ultimo_cambio = ? WHERE id_usuario = ?',
      [hashContrasena, ahora, idUsuario]);
  }
}
module.exports = Usuario;
