'use strict';
/** Datos iniciales de demostración: puesto, encargada, pacientes y la jornada de hoy. */
const bcrypt = require('bcryptjs');
const ConexionBD = require('./datos/ConexionBD');
const Usuario = require('./entidades/Usuario');
const { fechaISO, fechaHora, sumarDias } = require('./util');

async function sembrar({ conTurnos = true } = {}) {
  const bd = ConexionBD.obtener();
  const ya = await bd.consultar('SELECT COUNT(*) AS n FROM puesto_salud');
  if (Number(ya[0].n) > 0) return;
  const ahora = fechaHora();
  const { idInsertado: idPuesto } = await bd.ejecutar(
    'INSERT INTO puesto_salud (nombre, municipio, codigo_autorizacion_hash, duracion_consulta_min) VALUES (?, ?, ?, ?)',
    ['Puesto de Salud El Carmen', 'El Carmen', await bcrypt.hash('CARMEN-2026', 10), 15]);
  const clave = await bcrypt.hash('Clave2026', 10);
  const idEnc = await Usuario.registrar({ tipoDocumento: 'CC', numeroDocumento: '1010101010', rol: 'Encargado', nombres: 'Luz Marina', apellidos: 'Pérez', celular: '3101112233', idPuesto, cargo: 'Recepción' }, clave, ahora);
  const pacientes = [
    ['1020304050', 'Ana Lucía', 'Gómez', '3124567890', 'La Esperanza'],
    ['1030405060', 'José', 'Martínez', '3139876543', 'El Retiro'],
    ['1040506070', 'María', 'Rojas', '3145550000', 'San Isidro'],
    ['1050607080', 'Pedro', 'Castro', '3156667788', 'La Esperanza'],
    ['1060708090', 'Rosa', 'Díaz', '3167778899', 'El Carmen'],
  ];
  const ids = [];
  for (const [doc, n, a, cel, v] of pacientes)
    ids.push(await Usuario.registrar({ tipoDocumento: 'CC', numeroDocumento: doc, rol: 'Paciente', nombres: n, apellidos: a, celular: cel, vereda: v }, clave, ahora));
  const hoy = fechaISO();
  const { idInsertado: idJ } = await bd.ejecutar(
    `INSERT INTO jornada (id_puesto, id_encargado, fecha, hora_inicio, hora_fin, cupos_totales, estado, fecha_creacion) VALUES (?, ?, ?, '07:00', '17:00', 20, 'Abierta', ?)`,
    [idPuesto, idEnc, hoy, ahora]);
  await bd.ejecutar(
    `INSERT INTO jornada (id_puesto, id_encargado, fecha, hora_inicio, hora_fin, cupos_totales, estado, fecha_creacion) VALUES (?, ?, ?, '07:00', '12:00', 10, 'Abierta', ?)`,
    [idPuesto, idEnc, sumarDias(hoy, 1), ahora]);
  if (conTurnos) {
    for (let k = 1; k < ids.length; k++)
      await bd.ejecutar(`INSERT INTO turno (id_jornada, id_paciente, numero, estado, fecha_solicitud) VALUES (?, ?, ?, 'Asignado', ?)`, [idJ, ids[k], k, ahora]);
  }
}
module.exports = { sembrar };
if (require.main === module) {
  ConexionBD.obtener().conectar().then(() => sembrar()).then(() => { console.log('Datos iniciales creados'); return ConexionBD.obtener().cerrar(); });
}
