# VedaAI

VedaAI is an AI-powered assessment generation platform designed to transform source materials (PDFs, text) into structured, high-quality assessments (MCQs, Short Answers, Long Answers) using advanced LLMs like Gemini 2.0.

## Features

- **AI-Powered Generation**: Automatically generate questions from complex source material.
- **Multiple Question Types**: Supports Multiple Choice Questions (MCQs), Short Answers, and Long Answers.
- **Structured Output**: Questions are generated with clear learning objectives, difficulty levels, and detailed explanations.
- **Asynchronous Processing**: Uses BullMQ and Redis for robust, background generation tasks.
- **Real-time Updates**: Progress tracking via WebSockets.
- **Resilient Architecture**: Built-in exponential backoff and retry mechanisms to handle API rate limits (optimized for Gemini Free Tier).

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS (optional), Zustand.
- **Backend**: Node.js, Express, TypeScript.
- **Database**: MongoDB (Mongoose).
- **Task Queue**: BullMQ, Redis.
- **AI Integration**: Google Gemini API (via OpenAI-compatible endpoint).

## Getting Started

### Prerequisites

- Node.js (v18+)
- MongoDB
- Redis

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/nik1062/VEDAAI.git
   cd VEDAAI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory:
   ```env
   PORT=4000
   MONGODB_URI=your_mongodb_uri
   REDIS_URL=your_redis_url
   OPENAI_API_KEY=your_gemini_api_key
   OPENAI_MODEL=gemini-2.0-flash
   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
   CORS_ORIGIN=http://localhost:5173
   ASSESSMENT_WORKER_CONCURRENCY=1
   ```

### Running the Application

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the API server:
   ```bash
   npm run start
   ```

3. Start the assessment worker:
   ```bash
   npm run worker:assessment
   ```

4. Start the frontend (in a separate terminal):
   ```bash
   npm run dev
   ```

## Resilience Features

This project is specially tuned for the Gemini Free Tier (15 RPM limit):
- **Exponential Backoff**: Internal retries in `AIGeneratorService` with increasing delays.
- **Worker Throttling**: Configurable concurrency to prevent API flooding.
- **Persistent Retries**: BullMQ handles long-term retries for transient API failures.

## License

[MIT](LICENSE)
