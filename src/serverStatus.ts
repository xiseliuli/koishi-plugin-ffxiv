import {Context, segment} from "koishi";
import {getServers} from "./lib/API/sdoFF14Data";
import {drawServerStatus} from "./lib/canvas/serverStatus";
import {bufferToImageSegment} from "./lib/canvas/Util";

interface CanvasConfig {
    saveToLocal?: boolean;
}

export function apply(ctx: Context, config: CanvasConfig = {}) {
    ctx.command("ffxiv.server")
        .alias("服务器状态")
        .alias("绝育查询")
        .action(async() => {
            const serverStatus = await getServers();
            if (typeof serverStatus !== "string") {
                const image = await drawServerStatus(serverStatus.Data);
                const imageSegment = await bufferToImageSegment(image, 'png', config.saveToLocal);
                return segment("image", imageSegment);
            }
            return;
        });
}
