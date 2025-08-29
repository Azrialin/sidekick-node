import "dotenv/config";
import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import { z } from "zod";
import { searchWikipedia } from "./tools.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

//驗證前端送進來的 body
const BodySchema = z.object({
    message: z.string().min(1),
    history: z.array(z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string()
    })).optional().default([])
});

// 工具定義（讓模型能主動要求呼叫的schema）
const tools = [
    {
        type: "function",
        function: {
            name: "searchWikipedia",
            description: "查詢 Wikipedia 並回傳精簡摘要",
            parameters: {
                type: "object",
                properties: { query: { type: "string", description: "查詢關鍵字" } },
                required: ["query"]
            }
        }
    }
];

// 工具實際處理器（可擴充）
const toolHandlers = {
    async searchWikipedia(args) {
        const q = (args?.query ?? "").toString();
        return await searchWikipedia(q);
    },
};

//  /api/chat 主流程
app.post("/api/chat", async (req, res) => {
    try {
        // 1. 驗證前端送進來的 body
        const { message, history } = BodySchema.parse(req.body);

        // 2. system prompt：定義助手風格與行為
        const system = {
            role: "system",
            content:
                "你是實用的 AI Sidekick，擅長用簡單語言解釋，必要時會呼叫工具取得資訊。"
        };

        // 3. 第一輪對話：模型決定是否使用工具
        const chat1 = await client.chat.completions.create({
            model: "gpt-4o-mini",     // 用你可用的模型
            messages: [system, ...history, { role: "user", content: message }],
            tools
        });

        const assistantMsg = chat1.choices[0].message;

        // 4. 如有 tool_calls => 逐一回覆 tool 訊息
        if (assistantMsg.tool_calls?.length) {
            const toolMessages = [];
            for (const call of assistantMsg.tool_calls) {
                const name = call.function?.name;
                let args = {};
                try { args = JSON.parse(call.function?.arguments || "{}"); } catch { }
                let out = `未實作的工具：${name}`;
                if (name && toolHandlers[name]) {
                    try { out = await toolHandlers[name](args); }
                    catch (e) { out = `工具執行失敗：${e?.message ?? e}`; }
                }
                toolMessages.push({
                    role: "tool",
                    tool_call_id: call.id,   // 必須精準對上
                    name,
                    content: String(out),
                });
            }

            // 5. 把 tool 結果交回模型，產生最終答案
            const chat2 = await client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    system,
                    ...history,
                    { role: "user", content: message },
                    assistantMsg,         // 一定要帶回含 tool_calls 的 assistant
                    ...toolMessages,      // 對每個 call 都要有對應的 tool 訊息
                ],
                // 若希望擴充還能再連續觸發下一輪工具，這裡可再次帶 tools
                // tools,
            });

            return res.json({
                answer: chat2.choices[0].message.content,
                usedTools: assistantMsg.tool_calls.map(c => c.function?.name).filter(Boolean),
            });
        }

        // 6. 沒用工具就直接回
        return res.json({
            answer: assistantMsg.content ?? "(沒有回覆內容)",
            usedTools: [],
        });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err?.message ?? "Bad Request" });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sidekick Node server on http://localhost:${port}`));
