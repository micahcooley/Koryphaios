// Integration tests for API endpoints
import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// Mock server for testing
const BASE_URL = "http://localhost:3000";

describe("API Integration Tests", () => {
  describe("GET /api/health", () => {
    test("returns health status", async () => {
      const response = await fetch(`${BASE_URL}/api/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data).toHaveProperty("version");
      expect(data.data).toHaveProperty("uptime");
    });
  });

  describe("Sessions API", () => {
    let sessionId: string;

    test("POST /api/sessions creates a new session", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test Session" }),
      });

      const data = await response.json();
      expect(response.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.data).toHaveProperty("id");
      expect(data.data.title).toBe("Test Session");

      sessionId = data.data.id;
    });

    test("GET /api/sessions lists all sessions", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    test("GET /api/sessions/:id returns session details", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data.id).toBe(sessionId);
    });

    test("PATCH /api/sessions/:id updates session title", async () => {
      const newTitle = "Updated Test Session";
      const response = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data.title).toBe(newTitle);
    });

    test("GET /api/sessions/:id/messages returns empty array for new session", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions/${sessionId}/messages`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBe(0);
    });

    test("DELETE /api/sessions/:id deletes session", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
        method: "DELETE",
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);

      // Verify deletion
      const getResponse = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
      const getData = await getResponse.json();
      expect(getResponse.status).toBe(404);
    });
  });

  describe("Providers API", () => {
    test("GET /api/providers returns provider status", async () => {
      const response = await fetch(`${BASE_URL}/api/providers`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe("Agents API", () => {
    test("GET /api/agents/status returns agent status", async () => {
      const response = await fetch(`${BASE_URL}/api/agents/status`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.data).toHaveProperty("workers");
    });
  });

  describe("Input Validation", () => {
    test("rejects invalid session ID", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions/invalid/../path`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
    });

    test("rejects oversized session title", async () => {
      const longTitle = "a".repeat(300);
      const response = await fetch(`${BASE_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: longTitle }),
      });

      const data = await response.json();
      expect(response.status).toBe(201);
      // Title should be truncated to SESSION.MAX_TITLE_LENGTH (200)
      expect(data.data.title.length).toBeLessThanOrEqual(200);
    });
  });

  describe("CORS Headers", () => {
    test("includes CORS headers in response", async () => {
      const response = await fetch(`${BASE_URL}/api/health`, {
        headers: { "Origin": "http://localhost:5173" },
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
      expect(response.headers.get("Access-Control-Allow-Methods")).toBeTruthy();
    });

    test("handles preflight OPTIONS request", async () => {
      const response = await fetch(`${BASE_URL}/api/sessions`, {
        method: "OPTIONS",
        headers: { "Origin": "http://localhost:5173" },
      });

      expect(response.status).toBe(204);
    });
  });
});
