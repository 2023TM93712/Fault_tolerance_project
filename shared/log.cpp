#include "log.h"
#include <iostream>
#include <ctime>

Logger& Logger::instance() {
    static Logger inst;
    return inst;
}

Logger::Logger() {
    file_.open("system.log", std::ios::app);
}

void Logger::log(const std::string& level, const std::string& msg) {
    std::lock_guard<std::mutex> lock(mtx_);

    std::time_t t = std::time(nullptr);
    char buf[32];
    strftime(buf, sizeof(buf), "%F %T", localtime(&t));

    std::string line = std::string("[") + buf + "][" + level + "] " + msg;

    std::cout << line << std::endl;
    file_ << line << std::endl;
}

void Logger::info(const std::string& msg) { log("INFO", msg); }
void Logger::warn(const std::string& msg) { log("WARN", msg); }
void Logger::error(const std::string& msg) { log("ERROR", msg); }
