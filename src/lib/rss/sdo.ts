import Parser from "rss-parser";
import fs from "fs";
import path from "path";

export interface NewsConfig {
    url: string
    duration: number
    timeout?: number
    retries?: number
    retryDelay?: number
}

export const newsConfig: NewsConfig = ((): NewsConfig => {
    const defaultConfig: NewsConfig = {
        url: `https://rsshub.app/ff14/zh/all.rss`,
        duration: 15 * 60 * 1000,
        timeout: 10000, // 10秒超时
        retries: 3, // 重试3次
        retryDelay: 2000 // 重试间隔2秒
    }
    try {
        if (!fs.existsSync(path.join(process.cwd(), "/data"))) fs.mkdirSync(path.join(process.cwd(), "/data"));
        return {
            ...defaultConfig,
            ...JSON.parse(fs.readFileSync(path.join(process.cwd(), "/data/news_config.json"), "utf-8")) as NewsConfig
        };
    } catch {
        return defaultConfig;
    }
})()

const rssParser = new Parser({
    timeout: newsConfig.timeout || 10000,
    headers: {
        'User-Agent': 'Koishi-FFXIV-Plugin/2.0.8'
    }
});

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 带重试机制的RSS解析函数
export const rssFF14Sdo = async () => {
    const maxRetries = newsConfig.retries || 3;
    const retryDelay = newsConfig.retryDelay || 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 尝试获取RSS数据 (第${attempt}次尝试)`);
            
            const result = await rssParser.parseURL(newsConfig.url);
            console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] RSS数据获取成功`);
            
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] RSS获取失败 (第${attempt}次尝试): ${errorMessage}`);
            
            // 如果是最后一次尝试，抛出错误
            if (attempt === maxRetries) {
                console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] RSS获取彻底失败，已重试${maxRetries}次`);
                throw new Error(`RSS获取失败，已重试${maxRetries}次。最后错误: ${errorMessage}`);
            }
            
            // 等待后重试
            console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${retryDelay / 1000}秒后进行第${attempt + 1}次重试...`);
            await delay(retryDelay);
        }
    }
};
