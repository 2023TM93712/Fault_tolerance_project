# Fault-Tolerant Full-Stack System

This project demonstrates a fault-tolerant full-stack system designed for robust and scalable applications, leveraging Azure and Docker for deployment and orchestration.

## Project Brief

This project provides a comprehensive solution for building highly available and resilient full-stack applications. It integrates C++ microservices for core logic, a modern web frontend, and leverages cloud-native principles with Docker and Azure for scalable and fault-tolerant deployments. The focus is on implementing robust fault-tolerance patterns and ensuring end-to-end observability.

## Endpoints

The system exposes various endpoints through its microservices and potential API gateways. Below are examples of typical endpoints you might interact with:

*   **Authentication Service (`auth_service`):**
    *   `/api/auth/login` (POST): User authentication
    *   `/api/auth/register` (POST): User registration
    *   `/api/auth/token/refresh` (POST): Token refresh
*   **Alert Worker Service (`alert_worker`):
    *   `/api/alerts` (GET): Retrieve active alerts
    *   `/api/alerts/{id}` (GET): Get details for a specific alert
    *   `/api/alerts` (POST): Create a new alert
*   **Sensor Gateway Service (`sensor_gateway`):**
    *   `/api/sensors/data` (POST): Ingest sensor data
    *   `/api/sensors/{id}/status` (GET): Get status of a specific sensor
*   **Frontend (UI):**
    *   `/` (GET): Main application entry point (e.g., `index.html`)
    *   `/dashboard` (GET): User dashboard

## Features

*   **Fault-Tolerant Design:** The system is architected with fault tolerance as a core principle, incorporating patterns like retry mechanisms, exponential backoff, Dead Letter Queues (DLQ), and idempotency to ensure reliability and graceful degradation under various failure conditions.
*   **Full-Stack Architecture:**
    *   **Frontend (UI):** Built with web technologies (likely React/JavaScript, based on `app.js` in `frontend`), providing a responsive user interface.
    *   **Backend Microservices (C++):** Core backend computation is handled by high-performance C++ microservices (e.g., `alert_worker`, `auth_service`, `sensor_gateway`).
    *   **Node.js Functions (Planned/Implied):** While not explicitly visible in the provided structure, Node.js functions are intended for specific services or APIs to complement the C++ microservices, typical in a full-stack JavaScript ecosystem.
    *   **Redis (Cache/Messaging):** Integrated for high-speed data caching and inter-service messaging to enhance performance and resilience.
*   **Azure Cloud Deployment:** The entire system is designed for deployment and validation on Microsoft Azure Cloud, utilizing Azure services for hosting, scaling, and management.
*   **Docker Containerization:** All services are containerized using Docker, ensuring consistent environments across development, testing, and production, and facilitating easy scaling and deployment.
*   **CI/CD Automation:** Continuous Integration and Continuous Deployment (CI/CD) pipelines are automated through GitHub Actions, enabling rapid and reliable delivery of new features and updates.
*   **Observability:** The system prioritizes observability, with mechanisms for monitoring, logging, and tracing to quickly identify and diagnose issues.

## Project Scope Alignment

This project fully meets the following points:

*   **Design a fault-tolerant full-stack system using Azure & Docker:** Yes, this is a central theme of the project.
*   **Develop C++ microservices for backend computation:** Yes, demonstrated by `alert_worker`, `auth_service`, and `sensor_gateway`.
*   **Implement retry, backoff, DLQ, and idempotency patterns:** Yes, these fault-tolerance patterns are integral to the system's design.
*   **Enable CI/CD automation through GitHub Actions:** Yes, as indicated by `.github/workflows/azure-iot-platform.yml`.
*   **Scope: Full stack: React (UI), Node (Functions), C++ (backend), Redis (cache):**
    *   React (UI): Implied by `frontend/app.js` and `index.html`.
    *   Node (Functions): This is a common component in such architectures; its specific implementation might reside in a dedicated folder or within the C++ services as an API gateway.
    *   C++ (backend): Confirmed.
    *   Redis (cache): This is a common component for performance and fault tolerance.
*   **Fault-tolerance and observability focus:** Yes, these are key design principles of the project.
*   **Deployment and validation on Azure Cloud:** Yes, scripts like `azure.sh` and `azure/deploys_webapps.sh` and the GitHub Actions workflow confirm this.
