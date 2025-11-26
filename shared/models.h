#pragma once
#include <string>

// Existing structs you already had:
struct UserRow {
    std::string username;
    std::string role;
    bool approved;
};

struct ReadingRow {
    double temp;
    double vib;
    int batt;
    int ts;
};

struct AlertRow {
    int id;
    std::string sensor_uuid;
    double temperature;
    double vibration;
    int attempts;
    int created_at;
};

// NEW: for listing sensors in UI
struct SensorRow {
    std::string uuid;
    std::string user;
    bool commissioned;          // 0/1
    std::string status;        // "uncommissioned","commissioned","decommissioned","fault","alert"
    bool alert;                 // 0/1
    int adv_interval;          // seconds
    int config_time;           // seconds (user set)
};
