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

const BodySchema = z.object({
    message: z.string().min(1),
    history: z.array(z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string()
    })).optional().default([])
});

/** 工具定義（讓模型能主動要求呼叫） */
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

app.post("/api/chat", async (req, res) => {
    try {
        const { message, history } = BodySchema.parse(req.body);

        // 系統提示：你可以放「Sidekick」的行為守則
        const system = {
            role: "system",
            content:
                "你是實用的 AI Sidekick，擅長用簡單語言解釋，必要時會呼叫工具取得資訊。"
        };

        // 先丟一次，看模型是否想用工具
        const chat1 = await client.chat.completions.create({
            model: "gpt-4o-mini",     // 用你可用的模型
            messages: [system, ...history, { role: "user", content: message }],
            tools
        });

        const first = chat1.choices[0].message;
        if (first.tool_calls && first.tool_calls.length > 0) {
            // 目前只示範一個 tool call
            const call = first.tool_calls[0];
            if (call.function?.name === "searchWikipedia") {
                const args = JSON.parse(call.function.arguments || "{}");
                const summary = await searchWikipedia(args.query);

                // 帶工具回傳再問一次
                const chat2 = await client.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        system,
                        ...history,
                        { role: "user", content: message },
                        first,
                        {
                            role: "tool",
                            tool_call_id: call.id,
                            name: "searchWikipedia",
                            content: summary
                        }
                    ]
                });
                return res.json({ answer: chat2.choices[0].message.content, usedTool: "searchWikipedia" });
            }
        }

        // 沒用工具就直接回
        return res.json({ answer: first.content ?? "(沒有回覆內容)", usedTool: null });
    } catch (err) {
        console.error(err);
        res.status(400).json({ error: err?.message ?? "Bad Request" });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Sidekick Node server on http://localhost:${port}`));
