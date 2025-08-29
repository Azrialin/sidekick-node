// Wikipedia REST API 回傳簡短摘要
export async function searchWikipedia(query) {
    const q = (query || "").trim();
    if (!q) return "請提供查詢關鍵字。";
  
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`;
  
    // 發 request 加上 User-Agent，避免某些代理或風控阻擋
    const res = await fetch(url, { headers: { "User-Agent": "sidekick-node-demo" } });
  
    if (!res.ok) return `查詢失敗 (${res.status})`;
  
    const data = await res.json();
    return data?.extract || "沒有找到相關條目。";
  }