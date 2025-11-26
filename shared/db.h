#pragma once
#include <string>
#include <vector>
#include <chrono>
#include <random>
#include <sstream>
#include <iomanip>
#include <sqlite3.h>
#include "models.h"
#include "log.h"

class Database
{
public:
    explicit Database(const std::string& filename, bool create_schema = false);
    ~Database();

    bool exec(const std::string& q);
    std::string uuid_v1();

    // ========== USERS ==========
    bool create_user(const std::string& u, const std::string& p, int sensor_count);
    bool approve_user(const std::string& u);
    bool validate_user(const std::string& u, const std::string& p,
                       bool& approved, std::string& role);
    int get_sensor_count(const std::string& u);
    std::vector<UserRow> get_users();

    // ========== SENSORS ==========
    void insert_uncommissioned(const std::string& uuid);
    void set_sensor_commissioned(const std::string& uuid, int config_time);
    std::vector<std::string> get_sensors(); 
    bool create_user_sensors(const std::string& username, int count);
    bool commission_sensor(const std::string& uuid, int config_time, int adv_interval);
    bool decommission_sensor(const std::string& uuid);
    bool recommission_sensor(const std::string& uuid, int config_time, int adv_interval);
    void update_adv_interval(const std::string& uuid, int adv_interval);
    std::vector<SensorRow> get_sensors_for_user(const std::string& username, bool admin);


    // ========== READINGS ==========
    bool insert_reading(const std::string& uuid, double temp, double vib, int batt);
    std::vector<ReadingRow> get_readings(const std::string& uuid, int max);

    // ========== ALERTS ==========
    std::vector<AlertRow> get_alerts();
    bool create_alert(const std::string& uuid, double temp, double vib);
    std::vector<AlertRow> get_pending_alerts(int max);
    void mark_alert_processed(int id);
    void mark_alert_failed(int id);
    void mark_alert_done(int id);

private:
    sqlite3* db_ = nullptr;

    void init_schema();
    void seed_default_admin();
};
