# Contributing to Fault-Tolerant Application

Thank you for your interest in contributing to our fault-tolerant microservices application! This document provides guidelines and information for contributors.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Pull Request Process](#pull-request-process)
7. [Issue Reporting](#issue-reporting)
8. [Architecture Guidelines](#architecture-guidelines)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- **Be Respectful**: Treat all contributors with respect and professionalism
- **Be Inclusive**: Welcome newcomers and diverse perspectives
- **Be Constructive**: Provide helpful feedback and suggestions
- **Be Patient**: Understand that everyone has different experience levels

## Getting Started

### Prerequisites

- **Docker & Docker Compose**: For containerized development
- **Node.js 18+**: For frontend and function simulator
- **C++ Compiler**: GCC or Clang with C++17 support
- **CMake 3.10+**: For C++ service builds
- **Git**: Version control

### Development Setup

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Fault_tolerance.git
   cd Fault_tolerance
   ```

2. **Environment Setup**:
   ```bash
   # Start all services
   docker-compose up -d
   
   # Verify services are running
   curl http://localhost:7071/function/health
   curl http://localhost:8080/health
   ```

3. **Local Development**:
   ```bash
   # Frontend development
   cd frontend
   npm install
   npm start
   
   # Function simulator development
   cd function_node
   npm install
   npm run dev
   ```

## Development Workflow

### Branch Strategy

- **main**: Stable production code
- **develop**: Integration branch for new features
- **feature/**: Individual feature branches
- **hotfix/**: Critical bug fixes
- **release/**: Release preparation

### Branch Naming

- `feature/add-authentication`
- `bugfix/fix-cors-headers`
- `hotfix/security-patch`
- `docs/update-api-documentation`

### Commit Messages

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Formatting changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(api): add circuit breaker pattern to C++ service
fix(frontend): resolve CORS issues with function simulator
docs(readme): update installation instructions
test(integration): add end-to-end test coverage
```

## Coding Standards

### JavaScript/Node.js

```javascript
// Use ES6+ features
const processData = async (data, idempotencyKey) => {
  try {
    // Implementation
  } catch (error) {
    console.error('Processing failed:', error);
    throw error;
  }
};

// Consistent naming
const API_BASE_URL = 'http://localhost:7071';
const circuitBreakerStates = new Map();
```

### React/Frontend

```javascript
// Functional components with hooks
const ProcessingForm = ({ onSubmit, isLoading }) => {
  const [inputData, setInputData] = useState('');
  
  // Event handlers
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    onSubmit(inputData);
  }, [inputData, onSubmit]);
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Component JSX */}
    </form>
  );
};
```

### C++

```cpp
// Use modern C++ features
class TextProcessor {
private:
    std::string processText(const std::string& input) const {
        // Implementation
    }

public:
    ProcessResult process(const ProcessRequest& request) {
        try {
            auto result = processText(request.data);
            return ProcessResult{result, "success"};
        } catch (const std::exception& e) {
            return ProcessResult{"", e.what()};
        }
    }
};
```

### Docker

```dockerfile
# Multi-stage builds
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs
COPY --from=builder /app .
```

## Testing Guidelines

### Unit Tests

**JavaScript**:
```javascript
describe('Circuit Breaker', () => {
  test('should open circuit after failure threshold', () => {
    const circuitBreaker = new CircuitBreaker();
    
    // Simulate failures
    for (let i = 0; i < 5; i++) {
      circuitBreaker.recordFailure();
    }
    
    expect(circuitBreaker.state).toBe('OPEN');
  });
});
```

**C++**:
```cpp
TEST(TextProcessorTest, ProcessValidInput) {
    TextProcessor processor;
    ProcessRequest request{"Hello World"};
    
    auto result = processor.process(request);
    
    EXPECT_EQ(result.status, "success");
    EXPECT_FALSE(result.data.empty());
}
```

### Integration Tests

```javascript
describe('API Integration', () => {
  test('should process data with idempotency', async () => {
    const testData = { data: 'test', idempotency_key: 'test-123' };
    
    const response1 = await fetch('/function/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    const response2 = await fetch('/function/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData)
    });
    
    expect(await response1.json()).toEqual(await response2.json());
  });
});
```

### Test Coverage

Maintain minimum test coverage:
- **Unit Tests**: 80% line coverage
- **Integration Tests**: Cover all API endpoints
- **E2E Tests**: Cover critical user workflows

## Pull Request Process

### Before Submitting

1. **Run Tests**:
   ```bash
   # Frontend tests
   cd frontend && npm test
   
   # Function simulator tests
   cd function_node && npm test
   
   # C++ service tests
   cd service_cpp && mkdir build && cd build && cmake .. && make && ctest
   
   # Integration tests
   docker-compose up -d && python tests/e2e_tests.py
   ```

2. **Code Quality**:
   ```bash
   # Lint JavaScript
   npm run lint
   
   # Format code
   npm run format
   ```

3. **Documentation**:
   - Update README if needed
   - Add/update API documentation
   - Include inline code comments

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added for new functionality
```

### Review Process

1. **Automated Checks**: CI/CD pipeline must pass
2. **Code Review**: At least one maintainer approval required
3. **Testing**: All tests must pass
4. **Documentation**: Relevant docs must be updated

## Issue Reporting

### Bug Reports

Use the bug report template:

```markdown
**Bug Description**
Clear description of the bug

**Steps to Reproduce**
1. Step one
2. Step two
3. Expected vs actual behavior

**Environment**
- OS: [e.g., Windows 11]
- Node.js version: [e.g., 18.17.0]
- Docker version: [e.g., 24.0.0]

**Additional Context**
Screenshots, logs, or other relevant information
```

### Feature Requests

```markdown
**Feature Description**
What feature would you like to see?

**Use Case**
Why is this feature important?

**Proposed Solution**
How should this feature work?

**Alternatives Considered**
Other approaches you've considered
```

## Architecture Guidelines

### Fault Tolerance Patterns

When adding new features, consider:

1. **Circuit Breaker**: Prevent cascade failures
2. **Retry with Backoff**: Handle transient failures
3. **Idempotency**: Ensure safe retries
4. **Health Checks**: Monitor service status
5. **Graceful Degradation**: Maintain partial functionality

### Service Communication

- Use HTTP for synchronous communication
- Implement proper error handling
- Add request/response logging
- Include correlation IDs for tracing

### State Management

- Use Redis for shared state
- Implement proper key expiration
- Handle Redis connection failures
- Consider data consistency requirements

## Getting Help

- **Documentation**: Check existing docs first
- **Issues**: Search existing issues
- **Discussions**: Use GitHub Discussions for questions
- **Slack/Discord**: Join our community channels (if applicable)

## Recognition

Contributors will be acknowledged in:
- CONTRIBUTORS.md file
- Release notes for significant contributions
- Annual contributor recognition

Thank you for contributing to making our fault-tolerant application better!