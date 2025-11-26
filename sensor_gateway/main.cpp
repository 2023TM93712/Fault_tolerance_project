#include <iostream>
#include <chrono>
#include <thread>
#include <cstdlib>   // for std::getenv
#include <string>

#include "../shared/db.h"
#include "../shared/log.h"
#include "../third_party/httplib.h"
#include "../third_party/nlohmann/json.hpp"
#include "sensor_sim.h"

using json = nlohmann::json;
#include <iostream>
#include <chrono>
#include <thread>
#include <atomic> // For std::atomic_bool

#include "../shared/db.h"
#include "../shared/log.h"
#include "../third_party/httplib.h"
#include "../third_party/nlohmann/json.hpp"
#include "sensor_sim.h"

using json = nlohmann::json;

// Function to load all sensor UUIDs from the database
std::vector<std::string> load_all_sensor_uuids(Database& db) {
    Logger::instance().info("Loading all sensor UUIDs from database...");
    std::vector<std::string> uuids = db.get_sensors(); // Assuming get_sensors() returns all UUIDs
    Logger::instance().info("Loaded " + std::to_string(uuids.size()) + " sensor UUIDs.");
    return uuids;
}

static std::string get_db_path() {
    if (const char* env = std::getenv("DB_PATH")) {
        if (*env) return std::string(env);
    }
    // Fallback for local/dev if env not set
    return "/app/data/iot.db";
}

int main()
{
    Logger::instance().info("SENSOR GATEWAY STARTED");
    Database db(get_db_path());

    // SensorSimulator is instantiated without initial UUIDs now, it will update dynamically
    SensorSimulator sim(db);
    
    // Start the sensor simulation in a background thread
    std::thread sim_thread(&SensorSimulator::loop, &sim);

    // Atomic boolean to control the update thread's lifecycle
    std::atomic_bool running(true);

    // Thread for periodically updating the SensorSimulator's list of sensors
    std::thread update_thread([&]() {
        while (running) {
            std::vector<std::string> current_uuids = load_all_sensor_uuids(db);
            sim.update_sensors(current_uuids);
            std::this_thread::sleep_for(std::chrono::seconds(5)); // Update every 5 seconds
        }
    });

    httplib::Server svr;

    // --- CORS middleware ---
    // This is the crucial part that allows the frontend to talk to the backend.
    svr.set_pre_routing_handler([](const httplib::Request& req, httplib::Response& res) {
        res.set_header("Access-Control-Allow-Origin", "*");
        res.set_header("Access-Control-Allow-Headers", "Content-Type");
        res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        // If it's an OPTIONS request (a "preflight" check), we're done.
        if (req.method == "OPTIONS") {
            res.status = 204; // No Content
            return httplib::Server::HandlerResponse::Handled;
        }
        // Otherwise, continue to the actual route handler.
        return httplib::Server::HandlerResponse::Unhandled;
    });


    // --- health check ---
    svr.Get("/health", [&](const httplib::Request&, httplib::Response& res) {
        res.set_content("OK", "text/plain");
    });

    // --- init sensors for a user (after signup) ---
    // POST /init_sensors  { "username": "user1", "count": 10 }
    svr.Post("/init_sensors", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json j = json::parse(req.body);
            std::string username = j.value("username", "");
            int count = j.value("count", 0);

            if (username.empty() || count <= 0) {
                res.status = 400;
                res.set_content("BAD_REQUEST", "text/plain");
                return;
            }

            Logger::instance().info("Init sensors for user=" + username +
                                    " count=" + std::to_string(count));
            db.create_user_sensors(username, count);

            // After creating new sensors, trigger an immediate update in the simulator
            std::vector<std::string> current_uuids = load_all_sensor_uuids(db);
            sim.update_sensors(current_uuids);

            json reply;
            reply["ok"] = true;
            reply["username"] = username;
            reply["count"] = count;
            res.set_content(reply.dump(), "application/json");
        }
        catch (...) {
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // --- list sensors ---
    // GET /sensors?user=xyz&admin=0/1
    svr.Get("/sensors", [&](const httplib::Request& req, httplib::Response& res) {
        std::string user;
        if (req.has_param("user")) {
            user = req.get_param_value("user");
        }
        bool admin = false;
        if (req.has_param("admin") && req.get_param_value("admin") == "1") {
            admin = true;
        }

        Logger::instance().info("Get sensors for user=" + user + " admin=" + (admin ? "1" : "0"));

        auto sensors = db.get_sensors_for_user(user, admin);
        json arr = json::array();
        for (auto &s : sensors) {
            json row;
            row["uuid"]         = s.uuid;
            row["user"]         = s.user;
            row["commissioned"] = s.commissioned;
            row["status"]       = s.status;
            row["alert"]        = s.alert;
            row["adv_interval"] = s.adv_interval;
            row["config_time"]  = s.config_time;
            arr.push_back(row);
        }
        res.set_content(arr.dump(), "application/json");
    });

    // --- readings for graph ---
    // GET /readings?uuid=SENS_xxx&max=200
    svr.Get("/readings", [&](const httplib::Request& req, httplib::Response& res) {
        if (!req.has_param("uuid")) {
            res.status = 400;
            res.set_content("MISSING_UUID", "text/plain");
            return;
        }
        std::string uuid = req.get_param_value("uuid");
        int max = 200;
        if (req.has_param("max")) {
            max = std::stoi(req.get_param_value("max"));
        }

        auto readings = db.get_readings(uuid, max);
        json arr = json::array();
        for (auto &r : readings) {
            json row;
            row["temp"]    = r.temp;
            row["vib"]     = r.vib;
            row["batt"]    = r.batt;
            row["ts"]      = r.ts;
            arr.push_back(row);
        }
        res.set_content(arr.dump(), "application/json");
    });

    // --- get all alerts ---
    svr.Get("/alerts", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            auto alerts = db.get_alerts();
            json arr = json::array();
            for (auto& a : alerts) {
                json row;
                row["id"]          = a.id;
                row["uuid"]        = a.sensor_uuid;
                row["temperature"] = a.temperature;
                row["vibration"]   = a.vibration;
                row["timestamp"]   = a.created_at; // Use created_at as timestamp
                arr.push_back(row);
            }
            res.set_content(arr.dump(), "application/json");
        } catch (const std::exception& e) {
            Logger::instance().error("Error getting alerts: " + std::string(e.what()));
            res.status = 500;
            res.set_content("INTERNAL_SERVER_ERROR", "text/plain");
        } catch (...) {
            Logger::instance().error("Unknown error getting alerts.");
            res.status = 500;
            res.set_content("INTERNAL_SERVER_ERROR", "text/plain");
        }
    });

    // --- commission sensor ---
    // POST /commission_sensor { "uuid": "...", "config_time": 60, "adv_interval": 5 }
    svr.Post("/commission", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json j = json::parse(req.body);
            std::string uuid = j.value("uuid", "");
            int interval_sec = j.value("interval_sec", 5);

            if (uuid.empty()) {
                res.status = 400;
                res.set_content("MISSING_UUID", "text/plain");
                return;
            }

            Logger::instance().info("Commission sensor " + uuid +
                                    " adv=" + std::to_string(interval_sec));
            bool ok = db.commission_sensor(uuid, 60, interval_sec);

            json reply;
            reply["ok"] = ok;
            res.set_content(reply.dump(), "application/json");
        }
        catch (...) {
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // --- decommission sensor ---
    // POST /decommission_sensor { "uuid": "..." }
    svr.Post("/decommission", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json j = json::parse(req.body);
            std::string uuid = j.value("uuid", "");
            if (uuid.empty()) {
                res.status = 400;
                res.set_content("MISSING_UUID", "text/plain");
                return;
            }
            Logger::instance().info("Decommission sensor " + uuid);
            bool ok = db.decommission_sensor(uuid);

            json reply;
            reply["ok"] = ok;
            res.set_content(reply.dump(), "application/json");
        }
        catch (...) {
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // --- recommission sensor ---
    // POST /recommission_sensor { "uuid": "...", "config_time": 60, "adv_interval": 5 }
    svr.Post("/recommission", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json j = json::parse(req.body);
            std::string uuid = j.value("uuid", "");
            int config_time  = j.value("config_time", 60);
            int adv_interval = j.value("adv_interval", 5);

            if (uuid.empty()) {
                res.status = 400;
                res.set_content("MISSING_UUID", "text/plain");
                return;
            }

            Logger::instance().info("Recommission sensor " + uuid);
            bool ok = db.recommission_sensor(uuid, config_time, adv_interval);

            json reply;
            reply["ok"] = ok;
            res.set_content(reply.dump(), "application/json");
        }
        catch (...) {
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // --- update advertising interval only ---
    // POST /set_adv_interval { "uuid": "...", "adv_interval": 10 }
    svr.Post("/set_adv", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json j = json::parse(req.body);
            std::string uuid = j.value("uuid", "");
            int interval_sec = j.value("interval_sec", 5);

            if (uuid.empty()) {
                res.status = 400;
                res.set_content("MISSING_UUID", "text/plain");
                return;
            }

            Logger::instance().info("Update adv interval uuid=" + uuid +
                                    " adv=" + std::to_string(interval_sec));
            db.update_adv_interval(uuid, interval_sec);

            json reply;
            reply["ok"] = true;
            res.set_content(reply.dump(), "application/json");
        }
        catch (...) {
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    Logger::instance().info("Gateway listening on 0.0.0.0:9002");
    svr.listen("0.0.0.0", 9002);

    running = false; // Signal update thread to stop
    sim_thread.join(); // Keep the main thread alive if the server stops
    update_thread.join();

    return 0;
}
