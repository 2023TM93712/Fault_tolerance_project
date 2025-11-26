#include <iostream>
#include <thread>
#include "../shared/log.h"
#include "../shared/models.h"
#include "../shared/db.h"
#include "../third_party/httplib.h"

using namespace std;

static const int MAX_RETRY = 5;

int main() {
    Logger::instance().info("=== ALERT WORKER STARTED ===");

    Database db("iot.db");

    while (true) {
        auto alerts = db.get_pending_alerts(100);

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
        this_thread::sleep_for(chrono::seconds(2));
    }
    return 0;
}
