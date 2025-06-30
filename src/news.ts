import {Context} from "koishi";
import {newsConfig, rssFF14Sdo} from "./lib/rss/sdo";
import {
    addBroadcastInfo,
    BroadcastInfo,
    getBroadcastInfo,
    getLastLoadRss,
    removeBroadcastInfo, setLastLoadRss
} from "./lib/leveldb/news";

export async function apply(ctx: Context) {
    ctx.command("ffxiv.news [status:string]")
        .alias("新闻推送")
        .action(async ({session}, status?: string) => {
            const broadcastInfo: BroadcastInfo = {
                selfId: session.selfId,
                channelId: session.channelId
            }
            if (status && ["on", "off", "开", "关"].includes(status.toLowerCase())) {
                if (status.toLowerCase() === "on" || status.toLowerCase() === "开") {
                    if (await addBroadcastInfo(broadcastInfo)) {
                        console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${session.channelId}打开了国服新闻推送。`)
                        broadcastList = await getBroadcastInfo();
                        // 重新启动RSS检查
                        consecutiveFailures = 0;
                        isRssCheckActive = true;
                        return "成功开启国服新闻推送。";
                    }
                    else return "国服新闻推送已开启，无需重复开启。";
                }
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${session.channelId}关闭了国服新闻推送。`)
                await removeBroadcastInfo(broadcastInfo);
                broadcastList = await getBroadcastInfo();
                return "成功关闭国服新闻推送。";
            }
        })

    /* 启动rss定时检查推送 */
    let broadcastList: BroadcastInfo[] = await getBroadcastInfo();
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 5; // 连续失败5次后暂停
    let isRssCheckActive = true;

    async function broadcastNews() {
        // 如果RSS检查已被暂停，则不执行
        if (!isRssCheckActive) {
            console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] RSS检查已暂停，跳过本次检查。`);
            setTimeout(broadcastNews, newsConfig.duration);
            return;
        }

        try {
            console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 正在检查国服官网RSS源……`);
            const news = await rssFF14Sdo();
            
            // 成功获取RSS，重置失败计数器
            consecutiveFailures = 0;
            
            let lastLoadDate = await getLastLoadRss();
            if (!lastLoadDate) {
                await setLastLoadRss(new Date().toISOString());
                lastLoadDate = new Date();
            }
            news.items.sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
            if (news.items.length)
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 国服官网最新的文章发布于${new Date(news.items[0].isoDate).toLocaleString("zh-CN", { hour12: false })}。`)
            else console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 未获取到国服官网文章信息。`);
            console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 本地最后检查于${lastLoadDate.toLocaleString("zh-CN", { hour12: false })}`)
            let i: number;
            for (i = 0; i < news.items.length && new Date(news.items[i].isoDate).getTime() > lastLoadDate.getTime(); i++) {}
            if (!i) console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 没有任何推送内容。`);
            else {
                await setLastLoadRss(new Date(news.items[0].isoDate));
                const content = news.items.slice(0, i)
                    .map(n =>
                        `${n.title}\r` +
                        `[${new Date(n.isoDate).toLocaleString("zh-CN", { hour12: false })}]\r` +
                        `${(n.contentSnippet.length >= 100) ? (n.contentSnippet.slice(0, 97) + "...") : n.contentSnippet}\r` +
                        `${n.link}`)
                    .join("\r--------\r")
                for (const ch of broadcastList) {
                    const bot = (() => {
                        for (const bot of ctx.bots) {
                            if (bot.selfId === ch.selfId) return bot;
                        }
                        return null;
                    })()
                    if (!bot) {
                        console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 找不到指定的Bot：${ch.selfId}`);
                        continue;
                    }
                    try {
                        await bot.sendMessage(ch.channelId, content);
                    } catch (sendError) {
                        console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 发送消息到频道 ${ch.channelId} 失败:`, sendError);
                    }
                }
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 已推送消息至${broadcastList.length}个会话。`)
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            consecutiveFailures++;
            console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 新闻推送功能遇到错误 (连续失败${consecutiveFailures}次): ${errorMessage}`);
            
            // 检查是否为网络相关错误
            if (errorMessage.includes('Status code 503') || 
                errorMessage.includes('ECONNREFUSED') || 
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('RSS获取失败')) {
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 检测到网络错误，将在下次检查时重试。`);
            } else {
                console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 未知错误:`, e);
            }

            // 如果连续失败次数达到上限，暂停RSS检查
            if (consecutiveFailures >= maxConsecutiveFailures) {
                isRssCheckActive = false;
                console.error(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] RSS检查已连续失败${maxConsecutiveFailures}次，暂停自动检查。`);
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] 要重新启动RSS检查，请使用命令重新开启新闻推送。`);
            }
        } finally {
            if (isRssCheckActive) {
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${Math.floor(newsConfig.duration / 1000 / 60)}分钟后将重新检查RSS源。`)
            } else {
                console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] RSS检查已暂停，${Math.floor(newsConfig.duration / 1000 / 60)}分钟后将再次检查状态。`)
            }
            setTimeout(broadcastNews, newsConfig.duration);
        }
    }
    void broadcastNews();
}
