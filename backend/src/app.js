'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const rutas = require('./rutas/rutas');

function crearApp() {
  const app = express();
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());
  app.use('/api', rutas);
  app.use(express.static(path.join(__dirname, '../../frontend'), { extensions: ['html'] }));
  app.use((err, req, res, next) => {
    if (err.status) return res.status(err.status).json({ codigo: err.codigo, mensaje: err.message });
    console.error(err);
    res.status(500).json({ codigo: 'ERROR', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo.' });
  });
  return app;
}
module.exports = crearApp;
