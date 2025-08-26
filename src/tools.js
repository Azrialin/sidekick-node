export async function searchWikipedia(query) {
    if (!query || !query.trim()) return "請提供查詢關鍵字。";
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, { headers: { "User-Agent": "sidekick-node-demo" } });
    if (!res.ok) return `查詢失敗 (${res.status})`;
    const data = await res.json();
    if (data.extract) return data.extract;
    return "沒有找到相關條目。";
}