#include <iostream>
#include "../shared/db.h"
#include "../shared/models.h"
#include "../shared/log.h"
#include "../third_party/httplib.h"
#include "../third_party/nlohmann/json.hpp"

using json = nlohmann::json;

static void add_cors(httplib::Response& res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Headers", "Content-Type");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

int main() {
    Logger::instance().info("=== AUTH SERVICE STARTED ===");

    Database db("iot.db");
    httplib::Server svr;

    // ---------- CORS preflight ----------
    svr.Options(R"(.*)", [&](const httplib::Request&, httplib::Response& res){
        add_cors(res);
        res.status = 200;
    });

    // ---------- SIGNUP ----------
    // POST /signup  { "username": "...", "password": "..." }
    svr.Post("/signup", [&](const httplib::Request& req, httplib::Response& res){
        try {
            auto j = json::parse(req.body);
            std::string u = j.value("username", "");
            std::string p = j.value("password", "");
            int sensor_count = j.value("sensor_count", 0);

            bool ok = false;
            if (!u.empty() && !p.empty()) {
                ok = db.create_user(u, p, sensor_count);
            }

            add_cors(res);
            res.set_content(ok ? "OK" : "USER_EXISTS_OR_ERR", "text/plain");
        }
        catch (...) {
            add_cors(res);
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // ---------- APPROVE USER ----------
    // POST /approve_user  { "username": "..." }
    svr.Post("/approve_user", [&](const httplib::Request& req, httplib::Response& res){
        try {
            auto j = json::parse(req.body);
            std::string u = j.value("username", "");

            bool ok = false;
            if (!u.empty()) {
                ok = db.approve_user(u);
            }

            if (ok) {
                int sensor_count = db.get_sensor_count(u);
                if (sensor_count > 0) {
                    httplib::Client cli("gateway", 9002);
                    json sensor_req;
                    sensor_req["username"] = u;
                    sensor_req["count"] = sensor_count;
                    cli.Post("/init_sensors", sensor_req.dump(), "application/json");
                }
            }

            add_cors(res);
            res.set_content(ok ? "OK" : "ERR", "text/plain");
        }
        catch (...) {
            add_cors(res);
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // ---------- LOGIN ----------
    // POST /login  { "username": "...", "password": "..." }
    // response: { "ok": bool, "approved": bool, "role": "user"/"admin" }
    svr.Post("/login", [&](const httplib::Request& req, httplib::Response& res){
        try {
            auto j = json::parse(req.body);
            std::string u = j.value("username", "");
            std::string p = j.value("password", "");

            bool approved = false;
            std::string role;
            bool ok = false;

            if (!u.empty() && !p.empty()) {
                ok = db.validate_user(u, p, approved, role);
            }

            json r;
            r["ok"] = ok;
            r["approved"] = approved;
            r["role"] = role;

            add_cors(res);
            res.set_content(r.dump(), "application/json");
        }
        catch (...) {
            add_cors(res);
            res.status = 400;
            res.set_content("BAD_JSON", "text/plain");
        }
    });

    // ---------- LIST USERS (for admin UI / future) ----------
    // GET /users
    // response: [ { "username": "...", "role": "...", "approved": true }, ... ]
    svr.Get("/users", [&](const httplib::Request&, httplib::Response& res){
        auto list = db.get_users();
        json arr = json::array();

        for (auto &u : list) {
            json j;
            j["username"] = u.username;
            j["role"] = u.role;
            j["approved"] = u.approved;
            arr.push_back(j);
        }

        add_cors(res);
        res.set_content(arr.dump(), "application/json");
    });

    Logger::instance().info("AUTH listening on 0.0.0.0:9001");
    svr.listen("0.0.0.0", 9001);
}
