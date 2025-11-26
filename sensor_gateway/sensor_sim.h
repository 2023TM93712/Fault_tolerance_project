#pragma once
#include <vector>
#include <string>
#include "../shared/db.h"

struct SimSensor {
    std::string uuid;
};

class SensorSimulator {
public:
    SensorSimulator(Database& db);
    void loop();
    void update_sensors(const std::vector<std::string>& current_uuids);

private:
    Database& db_;
    std::vector<SimSensor> sensors_;
};
