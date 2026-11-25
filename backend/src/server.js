'use strict';
require('./util');
const ConexionBD = require('./datos/ConexionBD');
const crearApp = require('./app');
const { sembrar } = require('./semilla');

(async () => {
  const bd = await ConexionBD.obtener().conectar();
  if (bd.driver === 'sqlite' || process.env.SEMBRAR === '1') await sembrar();
  const puerto = Number(process.env.PORT || 3000);
  crearApp().listen(puerto, () => console.log(`TurnoRural escuchando en http://localhost:${puerto} (BD: ${bd.driver})`));
})();
