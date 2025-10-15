#include <httplib.h>
#include <nlohmann/json.hpp>
#include <hiredis/hiredis.h>
#include <iostream>
#include <string>
#include <algorithm>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <csignal>
#include <atomic>
#include <thread>
#include <memory>

using json = nlohmann::json;

class RedisClient {
private:
    redisContext* context;
    
public:
    RedisClient(const std::string& host = "redis", int port = 6379) {
        context = redisConnect(host.c_str(), port);
        if (context == nullptr || context->err) {
            if (context) {
                std::cerr << "Redis connection error: " << context->errstr << std::endl;
                redisFree(context);
            } else {
                std::cerr << "Redis connection error: can't allocate redis context" << std::endl;
            }
            context = nullptr;
        }
    }
    
    ~RedisClient() {
        if (context) {
            redisFree(context);
        }
    }
    
    bool isConnected() const {
        return context != nullptr && context->err == 0;
    }
    
    bool set(const std::string& key, const std::string& value, int ttl_seconds = 300) {
        if (!isConnected()) return false;
        
        redisReply* reply = (redisReply*)redisCommand(context, "SETEX %s %d %s", 
                                                    key.c_str(), ttl_seconds, value.c_str());
        if (reply == nullptr) return false;
        
        bool success = (reply->type == REDIS_REPLY_STATUS && 
                       std::string(reply->str) == "OK");
        freeReplyObject(reply);
        return success;
    }
    
    std::string get(const std::string& key) {
        if (!isConnected()) return "";
        
        redisReply* reply = (redisReply*)redisCommand(context, "GET %s", key.c_str());
        if (reply == nullptr || reply->type != REDIS_REPLY_STRING) {
            if (reply) freeReplyObject(reply);
            return "";
        }
        
        std::string result(reply->str);
        freeReplyObject(reply);
        return result;
    }
    
    bool exists(const std::string& key) {
        if (!isConnected()) return false;
        
        redisReply* reply = (redisReply*)redisCommand(context, "EXISTS %s", key.c_str());
        if (reply == nullptr) return false;
        
        bool exists = (reply->type == REDIS_REPLY_INTEGER && reply->integer == 1);
        freeReplyObject(reply);
        return exists;
    }
};

class ProcessingService {
private:
    std::unique_ptr<RedisClient> redis;
    
public:
    ProcessingService() {
        redis = std::make_unique<RedisClient>();
        if (!redis->isConnected()) {
            std::cerr << "Warning: Redis not connected. Idempotency disabled." << std::endl;
        }
    }
    
    std::string getCurrentTimestamp() {
        auto now = std::chrono::system_clock::now();
        auto time_t = std::chrono::system_clock::to_time_t(now);
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()) % 1000;
        
        std::stringstream ss;
        ss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%S");
        ss << '.' << std::setfill('0') << std::setw(3) << ms.count() << 'Z';
        return ss.str();
    }
    
    std::string processData(const std::string& data) {
        // Simulate non-trivial processing by reversing the string
        std::string reversed = data;
        std::reverse(reversed.begin(), reversed.end());
        return reversed;
    }
    
    json processRequest(const json& request) {
        std::string data = request.value("data", "");
        std::string idempotency_key = request.value("idempotency_key", "");
        
        // Check idempotency
        if (!idempotency_key.empty() && redis && redis->isConnected()) {
            std::string cached_result = redis->get("idem:" + idempotency_key);
            if (!cached_result.empty()) {
                // Return cached result
                return json::parse(cached_result);
            }
        }
        
        // Process the data
        std::string processed = processData(data);
        std::string timestamp = getCurrentTimestamp();
        
        json response = {
            {"result", processed},
            {"processed_at", timestamp}
        };
        
        // Cache result for idempotency
        if (!idempotency_key.empty() && redis && redis->isConnected()) {
            redis->set("idem:" + idempotency_key, response.dump(), 300); // 5 min TTL
        }
        
        // Log the processing
        json log_entry = {
            {"timestamp", timestamp},
            {"action", "process_request"},
            {"data_length", data.length()},
            {"idempotency_key", idempotency_key},
            {"cached", false}
        };
        std::cout << log_entry.dump() << std::endl;
        
        return response;
    }
};

std::atomic<bool> server_running{true};

void signalHandler(int signal) {
    if (signal == SIGTERM || signal == SIGINT) {
        std::cout << "Received shutdown signal. Gracefully shutting down..." << std::endl;
        server_running = false;
    }
}

int main() {
    // Setup signal handlers for graceful shutdown
    std::signal(SIGTERM, signalHandler);
    std::signal(SIGINT, signalHandler);
    
    const int port = std::stoi(std::getenv("PORT") ? std::getenv("PORT") : "8080");
    
    httplib::Server server;
    ProcessingService service;
    
    // Health endpoint
    server.Get("/healthz", [](const httplib::Request&, httplib::Response& res) {
        json health = {
            {"status", "ok"},
            {"timestamp", std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch()).count()}
        };
        res.set_content(health.dump(), "application/json");
    });
    
    // Process endpoint
    server.Post("/process", [&service](const httplib::Request& req, httplib::Response& res) {
        try {
            if (req.get_header_value("Content-Type").find("application/json") == std::string::npos) {
                res.status = 400;
                json error = {{"error", "Content-Type must be application/json"}};
                res.set_content(error.dump(), "application/json");
                return;
            }
            
            json request_body = json::parse(req.body);
            json response = service.processRequest(request_body);
            
            res.set_content(response.dump(), "application/json");
        } catch (const json::exception& e) {
            res.status = 400;
            json error = {
                {"error", "Invalid JSON"},
                {"details", e.what()}
            };
            res.set_content(error.dump(), "application/json");
        } catch (const std::exception& e) {
            res.status = 500;
            json error = {
                {"error", "Internal server error"},
                {"details", e.what()}
            };
            res.set_content(error.dump(), "application/json");
        }
    });
    
    // Start server in a separate thread
    std::thread server_thread([&server, port]() {
        std::cout << "Starting C++ service on port " << port << std::endl;
        server.listen("0.0.0.0", port);
    });
    
    // Wait for shutdown signal
    while (server_running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    
    // Graceful shutdown
    server.stop();
    if (server_thread.joinable()) {
        server_thread.join();
    }
    
    std::cout << "C++ service shut down gracefully" << std::endl;
    return 0;
}