import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchWikipedia } from "./tools.js";

describe("searchWikipedia", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("空字串時回傳提示訊息", async () => {
        const result = await searchWikipedia("");
        expect(result).toBe("請提供查詢關鍵字。");
    });

    it("只有空白字串時回傳提示訊息", async () => {
        const result = await searchWikipedia("   ");
        expect(result).toBe("請提供查詢關鍵字。");
    });

    it("API 回 404 時回傳錯誤訊息", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 404 });
        const result = await searchWikipedia("notexist");
        expect(result).toBe("查詢失敗 (404)");
    });

    it("正常情況回傳 extract 內容", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({ extract: "Taiwan is an island." }),
        });
        const result = await searchWikipedia("Taiwan");
        expect(result).toBe("Taiwan is an island.");
    });

    it("extract 不存在時回傳提示訊息", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({}),
        });
        const result = await searchWikipedia("something");
        expect(result).toBe("沒有找到相關條目。");
    });
});
