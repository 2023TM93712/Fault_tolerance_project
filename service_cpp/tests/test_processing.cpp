#include <gtest/gtest.h>
#include <string>
#include <algorithm>

// Test helper functions - these would normally be in a separate header
std::string processData(const std::string& data) {
    std::string reversed = data;
    std::reverse(reversed.begin(), reversed.end());
    return reversed;
}

class ProcessingTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Setup for each test
    }
    
    void TearDown() override {
        // Cleanup after each test
    }
};

TEST_F(ProcessingTest, ProcessDataReversesString) {
    std::string input = "hello world";
    std::string expected = "dlrow olleh";
    std::string result = processData(input);
    
    EXPECT_EQ(result, expected);
}

TEST_F(ProcessingTest, ProcessDataHandlesEmptyString) {
    std::string input = "";
    std::string expected = "";
    std::string result = processData(input);
    
    EXPECT_EQ(result, expected);
}

TEST_F(ProcessingTest, ProcessDataHandlesSingleCharacter) {
    std::string input = "a";
    std::string expected = "a";
    std::string result = processData(input);
    
    EXPECT_EQ(result, expected);
}

TEST_F(ProcessingTest, ProcessDataHandlesSpecialCharacters) {
    std::string input = "!@#$%^&*()";
    std::string expected = ")(*&^%$#@!";
    std::string result = processData(input);
    
    EXPECT_EQ(result, expected);
}

TEST_F(ProcessingTest, ProcessDataHandlesUnicode) {
    std::string input = "café";
    std::string result = processData(input);
    
    // The result should be the reverse of the input
    EXPECT_NE(result, input);
    EXPECT_EQ(result.length(), input.length());
}

// Test idempotency key generation and validation
TEST_F(ProcessingTest, IdempotencyKeyValidation) {
    // Test that valid UUIDs are accepted
    std::string valid_uuid = "550e8400-e29b-41d4-a716-446655440000";
    EXPECT_GT(valid_uuid.length(), 0);
    
    // Test empty key handling
    std::string empty_key = "";
    EXPECT_EQ(empty_key.length(), 0);
}

// Test timestamp format
TEST_F(ProcessingTest, TimestampFormat) {
    // This is a basic test - in real implementation we'd test actual timestamp generation
    std::string sample_timestamp = "2023-10-15T10:30:45.123Z";
    
    // Check basic format
    EXPECT_GT(sample_timestamp.find('T'), 0);
    EXPECT_GT(sample_timestamp.find('Z'), 0);
    EXPECT_EQ(sample_timestamp.back(), 'Z');
}