-- =====================================================================
-- TurnoRural - Script de creación de la base de datos (MySQL 8)
-- Módulo 01 (Sprint 1), Módulo 02 + HU-0501 (Sprint 2), Módulo 03 (Sprint 3)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS turnorural_db CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;
USE turnorural_db;

-- ---------------------------------------------------------------- Módulo 01
CREATE TABLE puesto_salud (
  id_puesto                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre                    VARCHAR(80)  NOT NULL,
  municipio                 VARCHAR(60)  NOT NULL,
  codigo_autorizacion_hash  VARCHAR(255) NOT NULL,
  duracion_consulta_min     TINYINT UNSIGNED NOT NULL DEFAULT 15,
  CONSTRAINT pk_puesto PRIMARY KEY (id_puesto),
  CONSTRAINT ck_puesto_duracion CHECK (duracion_consulta_min BETWEEN 10 AND 60)
) ENGINE=InnoDB;

CREATE TABLE usuario (
  id_usuario                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_documento             VARCHAR(3)   NOT NULL,
  numero_documento           VARCHAR(15)  NOT NULL,
  rol                        VARCHAR(10)  NOT NULL,
  activo                     TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_registro             DATETIME     NOT NULL,
  fecha_autorizacion_datos   DATETIME     NOT NULL,
  CONSTRAINT pk_usuario PRIMARY KEY (id_usuario),
  CONSTRAINT uq_usuario_documento UNIQUE (numero_documento),
  CONSTRAINT ck_usuario_tipo CHECK (tipo_documento IN ('CC','TI','CE')),
  CONSTRAINT ck_usuario_rol CHECK (rol IN ('Paciente','Encargado'))
) ENGINE=InnoDB;

CREATE TABLE paciente (
  id_usuario        INT UNSIGNED NOT NULL,
  fecha_nacimiento  DATE         NULL,
  vereda            VARCHAR(60)  NOT NULL,
  CONSTRAINT pk_paciente PRIMARY KEY (id_usuario),
  CONSTRAINT fk_paciente_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE encargado (
  id_usuario  INT UNSIGNED NOT NULL,
  id_puesto   INT UNSIGNED NOT NULL,
  cargo       VARCHAR(40)  NOT NULL DEFAULT 'Recepción',
  CONSTRAINT pk_encargado PRIMARY KEY (id_usuario),
  CONSTRAINT fk_encargado_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  CONSTRAINT fk_encargado_puesto FOREIGN KEY (id_puesto) REFERENCES puesto_salud(id_puesto)
) ENGINE=InnoDB;

CREATE TABLE perfil (
  id_perfil   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario  INT UNSIGNED NOT NULL,
  nombres     VARCHAR(50)  NOT NULL,
  apellidos   VARCHAR(50)  NOT NULL,
  celular     VARCHAR(10)  NOT NULL,
  CONSTRAINT pk_perfil PRIMARY KEY (id_perfil),
  CONSTRAINT uq_perfil_usuario UNIQUE (id_usuario),
  CONSTRAINT fk_perfil_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE credencial (
  id_credencial        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario           INT UNSIGNED NOT NULL,
  hash_contrasena      VARCHAR(255) NOT NULL,
  intentos_fallidos    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta      DATETIME     NULL,
  fecha_ultimo_cambio  DATETIME     NOT NULL,
  CONSTRAINT pk_credencial PRIMARY KEY (id_credencial),
  CONSTRAINT uq_credencial_usuario UNIQUE (id_usuario),
  CONSTRAINT fk_credencial_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE sesion (
  id_sesion         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario        INT UNSIGNED NOT NULL,
  token_hash        VARCHAR(255) NOT NULL,
  fecha_inicio      DATETIME     NOT NULL,
  ultima_actividad  DATETIME     NOT NULL,
  fecha_fin         DATETIME     NULL,
  estado            VARCHAR(10)  NOT NULL DEFAULT 'activa',
  CONSTRAINT pk_sesion PRIMARY KEY (id_sesion),
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  CONSTRAINT ck_sesion_estado CHECK (estado IN ('activa','cerrada','expirada'))
) ENGINE=InnoDB;
CREATE INDEX ix_sesion_token ON sesion(token_hash);

CREATE TABLE codigo_recuperacion (
  id_codigo         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario        INT UNSIGNED NOT NULL,
  codigo_hash       VARCHAR(255) NOT NULL,
  fecha_expiracion  DATETIME     NOT NULL,
  intentos          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  usado             TINYINT(1)   NOT NULL DEFAULT 0,
  CONSTRAINT pk_codigo PRIMARY KEY (id_codigo),
  CONSTRAINT fk_codigo_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE registro_acceso (
  id_registro   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario    INT UNSIGNED NOT NULL,
  evento        VARCHAR(30)  NOT NULL,
  fecha_hora    DATETIME     NOT NULL,
  direccion_ip  VARCHAR(45)  NULL,
  CONSTRAINT pk_registro PRIMARY KEY (id_registro),
  CONSTRAINT fk_registro_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- Sprint 2 (HU-0501, Módulo 02)
CREATE TABLE jornada (
  id_jornada       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_puesto        INT UNSIGNED NOT NULL,
  id_encargado     INT UNSIGNED NOT NULL,
  fecha            DATE         NOT NULL,
  hora_inicio      TIME         NOT NULL,
  hora_fin         TIME         NOT NULL,
  cupos_totales    TINYINT UNSIGNED NOT NULL,
  estado           VARCHAR(12)  NOT NULL DEFAULT 'Abierta',
  fecha_creacion   DATETIME     NOT NULL,
  fecha_cierre     DATETIME     NULL,
  CONSTRAINT pk_jornada PRIMARY KEY (id_jornada),
  CONSTRAINT uq_jornada_puesto_fecha UNIQUE (id_puesto, fecha),
  CONSTRAINT fk_jornada_puesto FOREIGN KEY (id_puesto) REFERENCES puesto_salud(id_puesto),
  CONSTRAINT fk_jornada_encargado FOREIGN KEY (id_encargado) REFERENCES encargado(id_usuario),
  CONSTRAINT ck_jornada_cupos CHECK (cupos_totales BETWEEN 1 AND 40),
  CONSTRAINT ck_jornada_horas CHECK (hora_inicio < hora_fin),
  CONSTRAINT ck_jornada_estado CHECK (estado IN ('Abierta','EnAtencion','Cerrada','Cancelada'))
) ENGINE=InnoDB;

CREATE TABLE turno (
  id_turno             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_jornada           INT UNSIGNED NOT NULL,
  id_paciente          INT UNSIGNED NOT NULL,
  numero               TINYINT UNSIGNED NOT NULL,
  estado               VARCHAR(20)  NOT NULL DEFAULT 'Asignado',
  fecha_solicitud      DATETIME     NOT NULL,
  fecha_cancelacion    DATETIME     NULL,
  motivo_cancelacion   VARCHAR(100) NULL,
  fecha_marca          DATETIME     NULL,
  id_encargado_marca   INT UNSIGNED NULL,
  CONSTRAINT pk_turno PRIMARY KEY (id_turno),
  CONSTRAINT uq_turno_jornada_numero UNIQUE (id_jornada, numero),
  CONSTRAINT fk_turno_jornada FOREIGN KEY (id_jornada) REFERENCES jornada(id_jornada),
  CONSTRAINT fk_turno_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_usuario),
  CONSTRAINT fk_turno_encargado FOREIGN KEY (id_encargado_marca) REFERENCES encargado(id_usuario),
  CONSTRAINT ck_turno_estado CHECK (estado IN ('Asignado','Atendido','NoAsistio','Cancelado','CanceladoNovedad'))
) ENGINE=InnoDB;
CREATE INDEX ix_turno_paciente_estado ON turno(id_paciente, estado);
CREATE INDEX ix_turno_jornada_estado ON turno(id_jornada, estado);

-- ---------------------------------------------------------------- Sprint 3 (Módulo 03)
CREATE TABLE novedad (
  id_novedad       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_jornada       INT UNSIGNED NOT NULL,
  id_encargado     INT UNSIGNED NOT NULL,
  tipo             VARCHAR(20)  NOT NULL,
  descripcion      VARCHAR(300) NOT NULL,
  minutos_retraso  SMALLINT UNSIGNED NULL,
  fecha_registro   DATETIME     NOT NULL,
  CONSTRAINT pk_novedad PRIMARY KEY (id_novedad),
  CONSTRAINT fk_novedad_jornada FOREIGN KEY (id_jornada) REFERENCES jornada(id_jornada),
  CONSTRAINT fk_novedad_encargado FOREIGN KEY (id_encargado) REFERENCES encargado(id_usuario),
  CONSTRAINT ck_novedad_tipo CHECK (tipo IN ('MedicoNoAsiste','CierrePuesto','Retraso','Otra'))
) ENGINE=InnoDB;

CREATE TABLE notificacion_sms (
  id_notificacion  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_turno         INT UNSIGNED NOT NULL,
  id_novedad       INT UNSIGNED NULL,
  tipo             VARCHAR(15)  NOT NULL,
  celular          VARCHAR(10)  NOT NULL,
  mensaje          VARCHAR(160) NOT NULL,
  estado           VARCHAR(10)  NOT NULL DEFAULT 'Pendiente',
  intentos         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  fecha_envio      DATETIME     NULL,
  CONSTRAINT pk_notificacion PRIMARY KEY (id_notificacion),
  CONSTRAINT fk_notif_turno FOREIGN KEY (id_turno) REFERENCES turno(id_turno),
  CONSTRAINT fk_notif_novedad FOREIGN KEY (id_novedad) REFERENCES novedad(id_novedad),
  CONSTRAINT ck_notif_tipo CHECK (tipo IN ('Confirmacion','Novedad')),
  CONSTRAINT ck_notif_estado CHECK (estado IN ('Pendiente','Enviada','Fallida'))
) ENGINE=InnoDB;
