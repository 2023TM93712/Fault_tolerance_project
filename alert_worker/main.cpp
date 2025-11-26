#include <iostream>
#include <thread>
#include <cstdlib>   // for std::getenv
#include <string>
#include "../shared/log.h"
#include "../shared/models.h"
#include "../shared/db.h"
#include "../third_party/httplib.h"

using namespace std;

static const int MAX_RETRY = 5;

static std::string get_db_path() {
    if (const char* env = std::getenv("DB_PATH")) {
        if (*env) return std::string(env);
    }
    // Fallback for local/dev if env not set
    return "/app/data/iot.db";
}

int main() {
    Logger::instance().info("=== ALERT WORKER STARTED ===");

    Database db(get_db_path());

    while (true) {
        auto alerts = db.get_pending_alerts(100);

        db.exec("BEGIN;");
        for (auto &a : alerts) {
            string uuid = a.sensor_uuid;
            double t = a.temperature;
            double vib = a.vibration;
            int attempts = a.attempts;

            string msg = "ALERT " + uuid + " TEMP=" + to_string(t) + " VIB=" + to_string(vib);

            Logger::instance().info("Sending: " + msg);

            httplib::Client cli("sensor_gateway", 9002);
            auto res = cli.Post("/alert_notify", msg, "text/plain");

            if (res && res->status == 200) {
                Logger::instance().info("Alert ACK — processing OK");
                db.mark_alert_processed(a.id);
            }
            else {
                Logger::instance().warn("Alert failed — retry ++");
                db.mark_alert_failed(a.id);

                if (attempts + 1 >= MAX_RETRY) {
                    Logger::instance().error("Max retry reached — closing alert");
                    db.mark_alert_done(a.id);
                }
            }
        }
        db.exec("COMMIT;");
        this_thread::sleep_for(chrono::seconds(2));
    }
    return 0;
}
