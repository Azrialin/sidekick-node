import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// vi.hoisted 確保 mockCreate 在 vi.mock 的 factory 中可以被引用
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
    OpenAI: class {
        constructor() {
            this.chat = { completions: { create: mockCreate } };
        }
    },
}));

vi.mock("./tools.js", () => ({
    searchWikipedia: vi.fn().mockResolvedValue("Taiwan is an island."),
}));

const { app } = await import("./server.js");

let server;
let baseUrl;

beforeEach(async () => {
    mockCreate.mockReset();

    // 預設 mock：模型直接回覆，不使用 tool
    mockCreate.mockResolvedValue({
        choices: [{
            message: {
                content: "我是 AI 助手",
                tool_calls: null,
            },
        }],
    });

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

afterEach(() => {
    server.close();
});

describe("POST /api/chat", () => {
    it("缺少 message 欄位時回 400", async () => {
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });

    it("message 為空字串時回 400", async () => {
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "" }),
        });
        expect(res.status).toBe(400);
    });

    it("正常請求回傳 { answer, usedTools }", async () => {
        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "你好" }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty("answer");
        expect(body).toHaveProperty("usedTools");
        expect(Array.isArray(body.usedTools)).toBe(true);
    });

    it("模型使用 tool 時 usedTools 包含工具名稱", async () => {
        mockCreate
            // 第一輪：模型要求呼叫工具
            .mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: null,
                        tool_calls: [{
                            id: "call_1",
                            function: { name: "searchWikipedia", arguments: '{"query":"Taiwan"}' },
                        }],
                    },
                }],
            })
            // 第二輪：模型根據工具結果回覆
            .mockResolvedValueOnce({
                choices: [{ message: { content: "台灣是個美麗的島嶼。" } }],
            });

        const res = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "台灣是什麼？" }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.usedTools).toContain("searchWikipedia");
    });
});
