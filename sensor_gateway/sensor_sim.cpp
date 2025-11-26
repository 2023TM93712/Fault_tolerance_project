#include "sensor_sim.h"
#include "../shared/log.h"
#include <thread>
#include <chrono>
#include <random>
#include <algorithm> // For std::find_if

SensorSimulator::SensorSimulator(Database& db) : db_(db) {
    Logger::instance().info("Initializing SensorSimulator.");
}

void SensorSimulator::update_sensors(const std::vector<std::string>& current_uuids) {
    // Clear existing simulated sensors
    sensors_.clear();
    
    // Add new sensors based on the provided UUIDs
    for (const auto& uuid_str : current_uuids) {
        SimSensor s;
        s.uuid = uuid_str;
        sensors_.push_back(s);
    }
    Logger::instance().info("SensorSimulator updated with " + std::to_string(sensors_.size()) + " sensors.");
}

void SensorSimulator::loop() {
    Logger::instance().info("Sensor simulation loop started");

    std::mt19937 rng(std::random_device{}());
    std::uniform_real_distribution<double> tempD(20, 90);
    std::uniform_real_distribution<double> vibD(0, 10);
    std::uniform_int_distribution<int> battD(20, 100);

    while (true) {
        // If there are no sensors being simulated, add some defaults
        if (sensors_.empty()) {
            Logger::instance().warn("No sensors in simulator, adding defaults SENS_0 to SENS_4.");
            for (int i = 0; i < 5; i++) {
                SimSensor s;
                s.uuid = "SENS_" + std::to_string(i);
                sensors_.push_back(s);
                db_.insert_uncommissioned(s.uuid); // Ensure these are in the DB as uncommissioned
            }
        }

        for (auto &s : sensors_) {
            double t = tempD(rng);
            double vib = vibD(rng);
            int batt = battD(rng);

            // Insert reading only if the sensor is commissioned
            // The `db_` methods should handle this check internally if required by the DB schema
            db_.insert_reading(s.uuid, t, vib, batt);

            if (t > 80 || vib > 9) {
                db_.create_alert(s.uuid, t, vib);
                Logger::instance().warn("FAULT -> generating alert for " + s.uuid);
            }
        }
        std::this_thread::sleep_for(std::chrono::seconds(3));
    }
}
