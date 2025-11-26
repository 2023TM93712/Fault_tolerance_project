CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    approved INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE,
    commissioned INTEGER DEFAULT 0,
    config_time INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_uuid TEXT,
    timestamp INTEGER,
    temperature REAL,
    vibration REAL,
    battery INTEGER,
    fault INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_uuid TEXT,
    temperature REAL,
    vibration REAL,
    attempts INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    done INTEGER DEFAULT 0
);
