#pragma once
#include <fstream>
#include <mutex>
#include <string>

class Logger {
public:
    static Logger& instance();
    void info(const std::string& msg);
    void warn(const std::string& msg);
    void error(const std::string& msg);

private:
    Logger();
    std::ofstream file_;
    std::mutex mtx_;
    void log(const std::string& level, const std::string& msg);
};
