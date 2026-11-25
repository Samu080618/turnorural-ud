'use strict';
/**
 * ConexionBD: única clase de acceso a datos (capa de persistencia).
 * Las entidades nunca hablan con el gestor directamente; siempre pasan por aquí.
 * Gestor de producción: MySQL 8 (mysql2). Para demostración y pruebas
 * automáticas se puede usar SQLite en memoria con DB_DRIVER=sqlite.
 */
const fs = require('fs');
const path = require('path');

class ConexionBD {
  constructor() {
    this.driver = process.env.DB_DRIVER || 'mysql';
    this.pool = null;
    this.db = null;
  }

  async conectar() {
    if (this.driver === 'sqlite') {
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(process.env.SQLITE_FILE || ':memory:');
      this.db.exec('PRAGMA foreign_keys = ON;');
      const existe = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usuario'").get();
      if (!existe) this.db.exec(ConexionBD.mysqlASqlite(fs.readFileSync(path.join(__dirname, '../../../database/turnorural_db.sql'), 'utf8')));
    } else {
      const mysql = require('mysql2/promise');
      this.pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'turnorural_app',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'turnorural_db',
        timezone: '-05:00',
        dateStrings: true,
        connectionLimit: 10,
      });
    }
    return this;
  }

  static mysqlASqlite(sql) {
    return sql
      .replace(/^CREATE DATABASE.*$/gm, '')
      .replace(/^USE .*$/gm, '')
      .replace(/ENGINE=InnoDB/g, '')
      .replace(/\bINT UNSIGNED NOT NULL AUTO_INCREMENT/g, 'INTEGER NOT NULL')
      .replace(/\bUNSIGNED\b/g, '')
      .replace(/COLLATE \w+/g, '');
  }

  /** Ejecuta una consulta SELECT y devuelve las filas. */
  async consultar(sql, params = [], cx = null) {
    if (this.driver === 'sqlite') return this.db.prepare(sql.replace(/\s+FOR UPDATE/i, '')).all(...params);
    const [filas] = await (cx || this.pool).query(sql, params);
    return filas;
  }

  /** Ejecuta INSERT/UPDATE/DELETE y devuelve { idInsertado, filasAfectadas }. */
  async ejecutar(sql, params = [], cx = null) {
    if (this.driver === 'sqlite') {
      const r = this.db.prepare(sql).run(...params);
      return { idInsertado: Number(r.lastInsertRowid), filasAfectadas: r.changes };
    }
    const [r] = await (cx || this.pool).query(sql, params);
    return { idInsertado: r.insertId, filasAfectadas: r.affectedRows };
  }

  /** Ejecuta fn dentro de una transacción; si falla, hace rollback. */
  async transaccion(fn) {
    if (this.driver === 'sqlite') {
      this.db.exec('BEGIN IMMEDIATE');
      try { const r = await fn(null); this.db.exec('COMMIT'); return r; }
      catch (e) { this.db.exec('ROLLBACK'); throw e; }
    }
    const cx = await this.pool.getConnection();
    try {
      await cx.beginTransaction();
      const r = await fn(cx);
      await cx.commit();
      return r;
    } catch (e) { await cx.rollback(); throw e; }
    finally { cx.release(); }
  }

  async cerrar() {
    if (this.db) this.db.close();
    if (this.pool) await this.pool.end();
  }
}

let instancia = null;
ConexionBD.obtener = () => { if (!instancia) instancia = new ConexionBD(); return instancia; };
ConexionBD.reiniciar = () => { instancia = null; };
module.exports = ConexionBD;
