#include "db.h"
#include "log.h"
#include <ctime>

// =================== CORE ===================

Database::Database(const std::string& filename)
{
    if (sqlite3_open(filename.c_str(), &db_) != SQLITE_OK)
    {
        Logger::instance().error("Failed to open DB: " + filename);
        db_ = nullptr;
        return;
    }

    // Better concurrency
    exec("PRAGMA journal_mode=WAL;");

    // If DB is locked, wait up to 5s for it to become available.
    sqlite3_busy_timeout(db_, 5000);

    // Create tables if they don't exist
    init_schema();

    // Ensure default admin exists
    seed_default_admin();
}

Database::~Database()
{
    if (db_)
        sqlite3_close(db_);
}

bool Database::exec(const std::string& q)
{
    char* err = nullptr;
    int rc = sqlite3_exec(db_, q.c_str(), nullptr, nullptr, &err);
    if (rc != SQLITE_OK)
    {
        std::string msg = err ? std::string(err) : "unknown error";
        Logger::instance().error("SQL ERR: " + msg + " | Q=" + q);
        if (err) sqlite3_free(err);
        return false;
    }
    return true;
}

// =================== SCHEMA & SEED ===================

void Database::init_schema()
{
    // USERS
    exec(
        "CREATE TABLE IF NOT EXISTS users ("
        "  username TEXT PRIMARY KEY,"
        "  password TEXT NOT NULL,"
        "  role TEXT NOT NULL DEFAULT 'user',"
        "  approved INTEGER NOT NULL DEFAULT 0,"
        "  sensor_count INTEGER NOT NULL DEFAULT 0"
        ");"
    );

    // SENSORS
    exec(
        "CREATE TABLE IF NOT EXISTS sensors ("
        "  uuid TEXT PRIMARY KEY, "
        "  user TEXT, "
        "  commissioned INTEGER NOT NULL DEFAULT 0, "
        "  config_time INTEGER DEFAULT 0, "
        "  status TEXT, "
        "  alert INTEGER NOT NULL DEFAULT 0, "
        "  adv_interval INTEGER DEFAULT 5"
        ");"
    );

    // SENSOR READINGS
    exec(
        "CREATE TABLE IF NOT EXISTS sensor_readings ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  sensor_uuid TEXT NOT NULL,"
        "  timestamp INTEGER NOT NULL,"
        "  temperature REAL,"
        "  vibration REAL,"
        "  battery INTEGER"
        ");"
    );

    // ALERTS
    exec(
        "CREATE TABLE IF NOT EXISTS alerts ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  sensor_uuid TEXT NOT NULL,"
        "  temperature REAL,"
        "  vibration REAL,"
        "  attempts INTEGER NOT NULL DEFAULT 0,"
        "  processed INTEGER NOT NULL DEFAULT 0,"
        "  done INTEGER NOT NULL DEFAULT 0,"
        "  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))"
        ");"
    );
}

void Database::seed_default_admin()
{
    // Create default admin user if not exists
    exec(
        "INSERT OR IGNORE INTO users(username,password,role,approved) "
        "VALUES('admin','admin123','admin',1);"
    );
}

// =================== USERS ===================

bool Database::create_user(const std::string& u, const std::string& p, int sensor_count)
{
    const char* q = "INSERT INTO users (username,password,role,approved,sensor_count) VALUES (?,?,'user',0,?);";
    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for create_user: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_text(stmt, 1, u.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, p.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 3, sensor_count);

    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);

    if (ok) {
        // This is the missing piece: actually create the sensors for the user.
        create_user_sensors(u, sensor_count);
    } else {
        Logger::instance().error("SQL ERR on exec for create_user: " + std::string(sqlite3_errmsg(db_)));
    }
    return ok;
}

bool Database::approve_user(const std::string& u)
{
    const char* q = "UPDATE users SET approved=1, role='user' WHERE username=?;";
    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for approve_user: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_text(stmt, 1, u.c_str(), -1, SQLITE_STATIC);

    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);
    return ok;
}

bool Database::validate_user(const std::string& u, const std::string& p,
                             bool& approved, std::string& role)
{
    const char* q = "SELECT password,approved,role FROM users WHERE username=?;";
    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for validate_user: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_text(stmt, 1, u.c_str(), -1, SQLITE_STATIC);

    bool ok = false;

    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        std::string pw = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        approved = sqlite3_column_int(stmt, 1);
        role = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));

        ok = (pw == p);
    }

    sqlite3_finalize(stmt);
    return ok;
}

int Database::get_sensor_count(const std::string& u)
{
    std::string q = "SELECT sensor_count FROM users WHERE username='" + u + "';";
    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(db_, q.c_str(), -1, &stmt, nullptr) != SQLITE_OK)
        return 0;

    int count = 0;
    if (sqlite3_step(stmt) == SQLITE_ROW)
    {
        count = sqlite3_column_int(stmt, 0);
    }

    sqlite3_finalize(stmt);
    return count;
}

std::vector<UserRow> Database::get_users()
{
    std::vector<UserRow> out;
    std::string q = "SELECT username,role,approved FROM users;";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q.c_str(), -1, &stmt, nullptr) != SQLITE_OK)
        return out;

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        UserRow u;
        u.username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        u.role     = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        u.approved = sqlite3_column_int(stmt, 2);
        out.push_back(u);
    }
    sqlite3_finalize(stmt);
    return out;
}

// =================== SENSORS ===================

void Database::insert_uncommissioned(const std::string& uuid) {
    exec("INSERT OR IGNORE INTO sensors (uuid, commissioned, status, alert, adv_interval) "
         "VALUES ('" + uuid + "',0,'uncommissioned',0,5)");
}

void Database::set_sensor_commissioned(const std::string& uuid, int config_time) {
    exec("UPDATE sensors SET commissioned=1, status='commissioned', config_time="
         + std::to_string(config_time) + " WHERE uuid='" + uuid + "'");
}

std::vector<std::string> Database::get_sensors() {
    std::vector<std::string> out;
    std::string q = "SELECT uuid FROM sensors";

    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db_, q.c_str(), -1, &stmt, nullptr);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        out.push_back((const char*)sqlite3_column_text(stmt, 0));
    }
    sqlite3_finalize(stmt);
    return out;
}
std::string Database::uuid_v1()
{
    using namespace std::chrono;
    static std::random_device rd;
    static std::mt19937_64 gen(rd());
    static std::uniform_int_distribution<uint64_t> dis;

    auto now = system_clock::now();
    auto ns = duration_cast<nanoseconds>(now.time_since_epoch()).count();

    uint16_t clock_seq = dis(gen) & 0x3FFF;
    uint64_t node = dis(gen);

    uint32_t time_low = ns & 0xFFFFFFFF;
    uint16_t time_mid = (ns >> 32) & 0xFFFF;
    uint16_t time_hi = ((ns >> 48) & 0x0FFF) | (1 << 12);

    std::stringstream ss;
    ss << std::hex << std::setfill('0')
       << std::setw(8) << time_low << "-"
       << std::setw(4) << time_mid << "-"
       << std::setw(4) << time_hi << "-"
       << std::setw(4) << clock_seq << "-"
       << std::setw(12) << node;

    return ss.str();
}
// NEW: bulk create sensors for a user
bool Database::create_user_sensors(const std::string& username, int count)
{
    const char* q = "INSERT OR IGNORE INTO sensors (uuid, user, commissioned, status, alert, adv_interval, config_time) VALUES (?,?,0,'uncommissioned',0,5,0);";
    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for create_user_sensors: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    // Use a transaction for much faster bulk inserts
    exec("BEGIN TRANSACTION;");

    for (int i = 1; i <= count; ++i) {
        std::string uuid = uuid_v1();
        sqlite3_bind_text(stmt, 1, uuid.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_text(stmt, 2, username.c_str(), -1, SQLITE_STATIC);
        if (sqlite3_step(stmt) != SQLITE_DONE) {
            Logger::instance().error("SQL ERR on exec for create_user_sensors: " + std::string(sqlite3_errmsg(db_)));
        }
        sqlite3_reset(stmt); // Reset for the next iteration
    }

    sqlite3_finalize(stmt);
    exec("COMMIT;");

    Logger::instance().info(
        "Created " + std::to_string(count) +
        " sensors for user=" + username);
    return true;
}

// NEW: set commissioned / status / adv_interval in one shot
bool Database::commission_sensor(const std::string& uuid, int config_time, int adv_interval)
{
    const char* q =
        "UPDATE sensors "
        "SET commissioned=1, status='commissioned', alert=0, "
        "adv_interval=?, config_time=? "
        "WHERE uuid=?;";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for commission_sensor: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_int(stmt, 1, adv_interval);
    sqlite3_bind_int(stmt, 2, config_time);
    sqlite3_bind_text(stmt, 3, uuid.c_str(), -1, SQLITE_STATIC);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        Logger::instance().error("SQL ERR on exec for commission_sensor: " + std::string(sqlite3_errmsg(db_)));
        sqlite3_finalize(stmt);
        return false;
    }
    sqlite3_finalize(stmt);
    return true;
}

bool Database::decommission_sensor(const std::string& uuid)
{
    std::string q =
        "UPDATE sensors "
        "SET commissioned=0, status='decommissioned' "
        "WHERE uuid='" + uuid + "'";
    return exec(q);
}

bool Database::recommission_sensor(const std::string& uuid, int config_time, int adv_interval)
{
    const char* q =
        "UPDATE sensors "
        "SET commissioned=1, status='commissioned', alert=0, "
        "adv_interval=?, config_time=? "
        "WHERE uuid=?;";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for recommission_sensor: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_int(stmt, 1, adv_interval);
    sqlite3_bind_int(stmt, 2, config_time);
    sqlite3_bind_text(stmt, 3, uuid.c_str(), -1, SQLITE_STATIC);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        Logger::instance().error("SQL ERR on exec for recommission_sensor: " + std::string(sqlite3_errmsg(db_)));
        sqlite3_finalize(stmt);
        return false;
    }
    sqlite3_finalize(stmt);
    return true;
}

void Database::update_adv_interval(const std::string& uuid, int adv_interval)
{
    std::string q =
        "UPDATE sensors "
        "SET adv_interval=" + std::to_string(adv_interval) + " "
        "WHERE uuid='" + uuid + "'";
    exec(q);
}

// NEW: list sensors for a user or all (admin)
std::vector<SensorRow> Database::get_sensors_for_user(const std::string& username, bool admin)
{
    std::vector<SensorRow> out;
    const char* q;
    sqlite3_stmt *stmt;

    if (admin) {
        q = "SELECT uuid,user,commissioned,status,alert,adv_interval,config_time FROM sensors";
        if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
            return out;
        }
    } else {
        q = "SELECT uuid,user,commissioned,status,alert,adv_interval,config_time "
            "FROM sensors WHERE user=?";
        if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
            return out;
        }
        sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
    }


    while (sqlite3_step(stmt) == SQLITE_ROW) {
        SensorRow s;
        s.uuid         = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
        // User can be NULL for unassigned sensors
        s.user         = sqlite3_column_text(stmt, 1) ? reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1)) : "";
        s.commissioned = (sqlite3_column_int(stmt, 2) != 0);
        s.status       = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
        s.alert        = (sqlite3_column_int(stmt, 4) != 0);
        s.adv_interval = sqlite3_column_int(stmt, 5);
        s.config_time  = sqlite3_column_int(stmt, 6);
        out.push_back(s);
    }
    sqlite3_finalize(stmt);
    return out;
}
// =================== READINGS ===================

bool Database::insert_reading(const std::string& uuid,
                              double temp,
                              double vib,
                              int batt)
{
    const char* q =
        "INSERT INTO sensor_readings("
        "sensor_uuid,timestamp,temperature,vibration,battery"
        ") VALUES (?,?,?,?,?);";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for insert_reading: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_text(stmt, 1, uuid.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 2, static_cast<int>(time(nullptr)));
    sqlite3_bind_double(stmt, 3, temp);
    sqlite3_bind_double(stmt, 4, vib);
    sqlite3_bind_int(stmt, 5, batt);

    if (sqlite3_step(stmt) != SQLITE_DONE) {
        Logger::instance().error("SQL ERR on exec for insert_reading: " + std::string(sqlite3_errmsg(db_)));
        sqlite3_finalize(stmt);
        return false;
    }
    sqlite3_finalize(stmt);
    return true;
}

std::vector<ReadingRow> Database::get_readings(const std::string& uuid, int max)
{
    std::vector<ReadingRow> out;
    std::string q =
        "SELECT temperature,vibration,battery,timestamp "
        "FROM sensor_readings WHERE sensor_uuid='" + uuid +
        "' ORDER BY timestamp DESC LIMIT " + std::to_string(max) + ";";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q.c_str(), -1, &stmt, nullptr) != SQLITE_OK)
        return out;

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        ReadingRow r;
        r.temp = sqlite3_column_double(stmt, 0);
        r.vib  = sqlite3_column_double(stmt, 1);
        r.batt = sqlite3_column_int(stmt, 2);
        r.ts   = sqlite3_column_int(stmt, 3);
        out.push_back(r);
    }
    sqlite3_finalize(stmt);
    return out;
}

// =================== ALERTS ===================

std::vector<AlertRow> Database::get_alerts()
{
    std::vector<AlertRow> out;
    const char* q =
        "SELECT id,sensor_uuid,temperature,vibration,attempts,created_at "
        "FROM alerts ORDER BY created_at DESC;";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for get_alerts: " + std::string(sqlite3_errmsg(db_)));
        return out;
    }

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        AlertRow a;
        a.id          = sqlite3_column_int(stmt, 0);
        a.sensor_uuid = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        a.temperature = sqlite3_column_double(stmt, 2);
        a.vibration   = sqlite3_column_double(stmt, 3);
        a.attempts    = sqlite3_column_int(stmt, 4);
        a.created_at  = sqlite3_column_int(stmt, 5);
        out.push_back(a);
    }
    sqlite3_finalize(stmt);
    return out;
}

bool Database::create_alert(const std::string& uuid, double temp, double vib)
{
    const char* q = "INSERT INTO alerts (sensor_uuid, temperature, vibration) VALUES (?, ?, ?);";
    sqlite3_stmt* stmt = nullptr;

    if (sqlite3_prepare_v2(db_, q, -1, &stmt, nullptr) != SQLITE_OK) {
        Logger::instance().error("SQL ERR on prepare for create_alert: " + std::string(sqlite3_errmsg(db_)));
        return false;
    }

    sqlite3_bind_text(stmt, 1, uuid.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_double(stmt, 2, temp);
    sqlite3_bind_double(stmt, 3, vib);

    bool ok = (sqlite3_step(stmt) == SQLITE_DONE);
    sqlite3_finalize(stmt);

    if (!ok) {
        Logger::instance().error("SQL ERR on exec for create_alert: " + std::string(sqlite3_errmsg(db_)));
    }
    return ok;
}

std::vector<AlertRow> Database::get_pending_alerts(int max)
{
    std::vector<AlertRow> out;
    std::string q =
        "SELECT id,sensor_uuid,temperature,vibration,attempts "
        "FROM alerts WHERE done=0 ORDER BY id ASC "
        "LIMIT " + std::to_string(max) + ";";

    sqlite3_stmt* stmt = nullptr;
    if (sqlite3_prepare_v2(db_, q.c_str(), -1, &stmt, nullptr) != SQLITE_OK)
        return out;

    while (sqlite3_step(stmt) == SQLITE_ROW)
    {
        AlertRow a;
        a.id          = sqlite3_column_int(stmt, 0);
        a.sensor_uuid = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
        a.temperature = sqlite3_column_double(stmt, 2);
        a.vibration   = sqlite3_column_double(stmt, 3);
        a.attempts    = sqlite3_column_int(stmt, 4);
        out.push_back(a);
    }
    sqlite3_finalize(stmt);
    return out;
}

void Database::mark_alert_processed(int id)
{
    exec("UPDATE alerts SET processed=1 WHERE id=" + std::to_string(id) + ";");
}

void Database::mark_alert_failed(int id)
{
    exec("UPDATE alerts SET attempts = attempts + 1 WHERE id=" + std::to_string(id) + ";");
}

void Database::mark_alert_done(int id)
{
    exec("UPDATE alerts SET done=1 WHERE id=" + std::to_string(id) + ";");
}
