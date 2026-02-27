# MAF Fulfillment App - QR & Address Scanner

A lightweight, modular web application designed to scan shipping labels, extract addresses via OCR, and decode QR codes. 

## Developer Introduction

This application is built with a separation of concerns in mind, making it easy to maintain, trace, and scale. It uses a **Node.js/Express** backend to handle API requests and a **Vanilla JavaScript (ES6 Modules)** frontend to ensure a lightweight footprint suitable for mobile devices and Progressive Web App (PWA) environments.

### Architecture Overview
* **Frontend:** * Divided into ES6 modules (`api.js`, `scanner.js`, `ui.js`, `utils.js`, `main.js`) to strictly separate DOM manipulation, hardware interfacing (Camera/OCR), and network requests.
  * Uses **Tesseract.js** for Optical Character Recognition (OCR) to read addresses.
  * Uses **jsQR** for rapid QR code detection.
* **Backend:** * **Express.js** REST API with separated route controllers (`authRoutes.js`, `scanRoutes.js`).
  * Secures endpoints using JSON Web Tokens (JWT).
  * Uses `bcrypt` for secure password hashing.
* **Database:** * **PostgreSQL** relational database.
  * Connection pooling is managed centrally in `server/config/db.js`.

---

## Getting Started (Docker)

The easiest way to run, test, and develop this application is using Docker. The provided `docker-compose.yml` file will spin up both the Node.js application and the PostgreSQL database, automatically linking them together.

### Prerequisites
* [Docker](https://docs.docker.com/get-docker/)
* [Docker Compose](https://docs.docker.com/compose/install/)

### Running the Application

1. **Build and Start the Containers:**
   Open your terminal in the root directory of the project and run:
   ```bash
   docker-compose up --build