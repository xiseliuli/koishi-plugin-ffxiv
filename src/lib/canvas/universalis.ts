import { Context } from 'koishi';
import {drawLegends} from "./Util";
import {__root_dir} from "../../index";
import * as path from "path";
import getRarityColor from "../util/getRarityColor";
import {toCurrentTimeDifference, toReadableNum} from "../util/format";
import {MarketBoardCurrentDataResponse} from "../API/universalis";

// 安全地计算文本高度的辅助函数
function safeGetTextHeight(measureResult: any, fallbackFontSize: number): number {
    try {
        // 如果 measureResult 不存在或异常，直接使用回退值
        if (!measureResult) {
            console.log(`Using fallback: ${fallbackFontSize} (no measureResult)`);
            return fallbackFontSize;
        }
        
        // 如果有 lines 属性且不为空，尝试计算
        if (measureResult.lines && Array.isArray(measureResult.lines) && measureResult.lines.length > 0) {
            const height = measureResult.lines
                .map((l: any) => {
                    if (l && typeof l.height === 'number' && l.height > 0) {
                        return l.height;
                    }
                    return fallbackFontSize * 0.8; // 单行默认高度
                })
                .reduce((p: number, c: number) => p + c, 0);
            
            if (height > 0) {
                console.log(`Text height from lines: ${height}`);
                return height;
            }
        }
        
        // 尝试使用其他属性（某些 Canvas 实现可能有不同的属性）
        if (typeof measureResult.height === 'number' && measureResult.height > 0) {
            console.log(`Text height from height property: ${measureResult.height}`);
            return measureResult.height;
        }
        
        // 如果都失败了，使用回退值
        console.log(`Using fallback: ${fallbackFontSize} (calculation failed)`);
        return fallbackFontSize;
        
    } catch (error) {
        console.error('Error calculating text height:', error);
        return fallbackFontSize;
    }
}

// 从字体字符串中提取字体大小
function extractFontSize(fontString: string): number {
    const match = fontString.match(/(\d+)px/);
    return match ? parseInt(match[1]) : 12;
}

export async function drawItemPriceList(koishiCtx: Context, itemInfo: {
    Name: string,
    Icon: string,
    LevelItem: number,
    ItemKind: { Name: string },
    ItemSearchCategory: { Name: string },
    Rarity: number,
    CanBeHq: number
}, saleInfo: MarketBoardCurrentDataResponse): Promise<Buffer> {
    const { Canvas, loadImage, FontLibrary } = koishiCtx.skia;
    
    if (!FontLibrary.has("Georgia")) FontLibrary.use("Georgia", path.join(__root_dir, "/public/fonts/Georgia.ttf"));
    if (!FontLibrary.has("WenquanyiZhengHei")) FontLibrary.use("WenquanyiZhengHei", path.join(__root_dir, "/public/fonts/WenquanyiZhengHei.ttf"));
    const width = 720, height = 960;
    const top = 16, bottom = 16,
        left = 16, right = 16,
        duration = 8,
        drawAreaWidth = width - left - right,
        drawAreaHeight = height - top - bottom;

    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext("2d");

    const hqImage = await loadImage(path.join(__root_dir, "/public/image/hq.png"));

    /* 填充背景 */
    ctx.save();
    const backgroundLinearGrad = ctx.createLinearGradient(0, 0, 0, height);
    backgroundLinearGrad.addColorStop(0, "rgb(255, 255, 255)");
    backgroundLinearGrad.addColorStop((top * 0.3) / height, "rgb(105, 105, 105)");
    backgroundLinearGrad.addColorStop((top * 0.9) / height, "rgb(75, 75, 75)");
    backgroundLinearGrad.addColorStop(1, "rgb(27, 27, 27)");
    ctx.fillStyle = backgroundLinearGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    /* 画物品图标 */
    const iconUrl = `https://cafemaker.wakingsands.com${itemInfo.Icon}`;
    const iconSide = 64;
    try {
        const itemImage = await loadImage(iconUrl);
        ctx.drawImage(itemImage, left, top, iconSide, iconSide);
    } catch (e) {
        console.warn(`Caution: Load image from ${iconUrl} failed.`);
        console.warn(e);
    }

    /* 写物品名 */
    ctx.save();
    const itemName = itemInfo.Name;
    const itemNameFontSize = 28;
    ctx.fillStyle = getRarityColor(itemInfo.Rarity);
    ctx.font = `${itemNameFontSize}px WenquanyiZhengHei, Georgia, Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(itemName,
        left + iconSide + duration,
        top,
        drawAreaWidth - iconSide - duration);
    const itemNameHeight = safeGetTextHeight(ctx.measureText(itemName), itemNameFontSize);
    ctx.restore();

    /* 写物品信息 */
    ctx.save();
    const itemDesc = `${itemInfo.ItemKind.Name} | ${itemInfo.ItemSearchCategory.Name} | 品级${itemInfo.LevelItem}`
    ctx.fillStyle = "rgb(120, 120, 120)"; // 更深的灰色，在白色背景上有更好对比度
    ctx.font = "18px WenquanyiZhengHei, Georgia, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(itemDesc,
        left + iconSide + duration,
        top + itemNameHeight + duration,
        drawAreaWidth - iconSide - duration);
    const itemDescHeight = safeGetTextHeight(ctx.measureText(itemDesc), 18);
    ctx.restore();

    /* 计算顶部区域底部位置 */
    const itemInfoAreaBottom = top + Math.max(iconSide, itemNameHeight + duration + itemDescHeight);

    /* 写物品最后更新信息 */
    ctx.save();
    const fetchTargetType: "region" | "dc" | "world" | "unknown" = saleInfo.worldName ? "world" : saleInfo.dcName ? "dc" : saleInfo.regionName ? "region" : "unknown";
    const fetchTargetName: string = (fetchTargetType === "world") ? saleInfo.worldName : (fetchTargetType === "dc") ? saleInfo.dcName : (fetchTargetType === "region") ? saleInfo.regionName : "未知";
    const itemLastUpdateDesc = `${fetchTargetName}${(fetchTargetType === "dc") ? "区" : ""} | 最后更新于${toCurrentTimeDifference(new Date(saleInfo.lastUploadTime), true)}（${new Date(saleInfo.lastUploadTime).toLocaleString("zh-CN", { hour12: false })}）`;
    ctx.fillStyle = "rgb(220, 220, 220)"; // 更亮的灰色，在渐变背景中部有更好可读性
    ctx.font = "14px WenquanyiZhengHei, Georgia, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(itemLastUpdateDesc,
        left,
        itemInfoAreaBottom + duration,
        drawAreaWidth - iconSide - duration);
    const itemLastUpdateHeight = safeGetTextHeight(ctx.measureText(itemLastUpdateDesc), 14);
    ctx.restore();

    /* 画物品高低价比较 */
    const nqColor = "rgb(210, 210, 210)";
    const hqColor = "rgb(221, 201, 70)";
    const linearHeight = 12;
    const legendSide = 16;
    const itemPriceCompareAreaTop = itemInfoAreaBottom + duration + itemLastUpdateHeight + duration;

    ctx.save();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "12px WenquanyiZhengHei, Georgia, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.textWrap = true;
    const legendsArea = drawLegends(ctx, [{color: nqColor, name: "普通"}, {color: hqColor, name: "高品质"}],
        left, itemPriceCompareAreaTop, legendSide, legendSide, duration);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "9px Georgia, WenquanyiZhengHei, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.textWrap = false;
    const minPriceNQ = `${saleInfo.minPriceNQ}`;
    const minPriceHQ = itemInfo.CanBeHq ? `${saleInfo.minPriceHQ}` : "无HQ版本";
    const maxPriceNQ = `${saleInfo.maxPriceNQ}`;
    const maxPriceHQ = itemInfo.CanBeHq ? `${saleInfo.maxPriceHQ}` : "无HQ版本";
    const maxNumberTextWidth = Math.max(
        ctx.measureText(`${minPriceNQ}`).width,
        ctx.measureText(`${minPriceHQ}`).width,
        ctx.measureText(`${maxPriceNQ}`).width,
        ctx.measureText(`${maxPriceHQ}`).width,
    );

    const itemPriceCompareAreaHeight = Math.max(legendsArea.height, linearHeight * 4 + duration);
    const minPrice = Math.min(saleInfo.minPriceNQ, saleInfo.minPriceHQ);
    const maxPrice = Math.max(saleInfo.maxPriceNQ, saleInfo.maxPriceHQ);
    const maxLinearWidth = drawAreaWidth - legendsArea.width - duration - maxNumberTextWidth - duration;

    // 最低NQ价格
    ctx.save();
    ctx.fillStyle = nqColor;
    const minPriceNQLinearWidth = saleInfo.minPriceNQ / maxPrice * maxLinearWidth;
    ctx.fillRect(
        left + legendsArea.width + duration, itemPriceCompareAreaTop,
        minPriceNQLinearWidth, linearHeight);
    ctx.restore();
    ctx.fillText(minPriceNQ,
        left + legendsArea.width + duration + minPriceNQLinearWidth + (saleInfo.minPriceNQ ? duration : 0),
        itemPriceCompareAreaTop + linearHeight / 2);

    // 最低HQ价格
    ctx.save();
    ctx.fillStyle = hqColor;
    const minPriceHQLinearWidth = saleInfo.minPriceHQ / maxPrice * maxLinearWidth;
    ctx.fillRect(
        left + legendsArea.width + duration, itemPriceCompareAreaTop + linearHeight,
        minPriceHQLinearWidth, linearHeight);
    ctx.restore();
    ctx.fillText(minPriceHQ,
        left + legendsArea.width + duration + minPriceHQLinearWidth + (saleInfo.minPriceHQ ? duration : 0),
        itemPriceCompareAreaTop + linearHeight + linearHeight / 2);

    // 最高NQ价格
    ctx.save();
    ctx.fillStyle = nqColor;
    const maxPriceNQLinearWidth = saleInfo.maxPriceNQ / maxPrice * maxLinearWidth;
    ctx.fillRect(
        left + legendsArea.width + duration, itemPriceCompareAreaTop + linearHeight * 2 + duration,
        maxPriceNQLinearWidth, linearHeight);
    ctx.restore();
    ctx.fillText(maxPriceNQ,
        left + legendsArea.width + duration + maxPriceNQLinearWidth + (saleInfo.maxPriceNQ ? duration : 0),
        itemPriceCompareAreaTop + linearHeight * 2 + duration + linearHeight / 2);

    // 最高HQ价格
    ctx.save();
    ctx.fillStyle = hqColor;
    const maxPriceHQLinearWidth = saleInfo.maxPriceHQ / maxPrice * maxLinearWidth;
    ctx.fillRect(
        left + legendsArea.width + duration, itemPriceCompareAreaTop + linearHeight * 3 + duration,
        maxPriceHQLinearWidth, linearHeight);
    ctx.restore();
    ctx.fillText(maxPriceHQ,
        left + legendsArea.width + duration + maxPriceHQLinearWidth + (saleInfo.maxPriceHQ ? duration : 0),
        itemPriceCompareAreaTop + linearHeight * 3 + duration + linearHeight / 2);

    ctx.restore();

    /* 写版权信息 */
    ctx.save();
    const announcement =
        `图片生成于${new Date().toLocaleString("zh-CN", { hour12: false })}，物品数据来源于cafemaker，价格数据来源于universalis，\n` +
        // "本功能来自插件（koishi-plugin-ffxiv），该插件基于koishi v3开发，\n" +
        // "插件开源于：https://github.com/ReiKohaku/koishi-plugin-ffxiv。\n" +
        "本插件作者（或开发团体）与cafemaker、universalis和《最终幻想14》的开发与发行公司无任何直接联系。\n" +
        "作者（或开发团体）不对您使用本功能带来的一切可能的后果承担任何责任。"
    ctx.fillStyle = "rgb(160, 160, 160)"; // 更亮的灰色，在深色背景底部有更好可读性
    ctx.font = "10px WenquanyiZhengHei, Georgia, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.textWrap = true;
    const announcementHeight = safeGetTextHeight(ctx.measureText(announcement), 10);
    const announcementTop = height - bottom - announcementHeight;
    ctx.fillText(announcement, left, announcementTop, drawAreaWidth);
    ctx.restore();

    /* 写物品出售列表 */
    let currentItemTop = itemPriceCompareAreaTop + itemPriceCompareAreaHeight + duration;
    const listBottom = announcementTop - duration;
    // 移除固定的itemHeight，改为动态计算
    const nqItemLinearGrad = ctx.createLinearGradient(left, 0, left + drawAreaWidth, 0);
    nqItemLinearGrad.addColorStop(0, "rgba(64, 64, 64, 255)");
    nqItemLinearGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    const hqItemLinearGrad = ctx.createLinearGradient(left, 0, left + drawAreaWidth, 0);
    hqItemLinearGrad.addColorStop(0, "rgba(152, 152, 64, 255)");
    hqItemLinearGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    
    // 预先计算文本高度来确定条目高度
    ctx.save();
    ctx.font = "26px Georgia, WenquanyiZhengHei, Arial, sans-serif"; // 价格数字字体更大
    const priceLineHeight = safeGetTextHeight(ctx.measureText("测试"), 26);
    ctx.font = "12px WenquanyiZhengHei, Georgia, Arial, sans-serif"; // 服务器信息字体更小
    const serverLineHeight = safeGetTextHeight(ctx.measureText("测试"), 12);
    ctx.restore();
    
    // 动态计算每个条目的高度：价格行高度 + 间距 + 服务器信息行高度 + 上下padding
    const dynamicItemHeight = priceLineHeight + duration + serverLineHeight + duration * 2;
    
    for (let i = 0; i < saleInfo.listings.length && currentItemTop + dynamicItemHeight < listBottom; i++) {
        const item = saleInfo.listings[i];
        ctx.save();
        ctx.fillStyle = item.hq ? hqItemLinearGrad : nqItemLinearGrad;
        ctx.fillRect(left, currentItemTop, drawAreaWidth, dynamicItemHeight);
        ctx.restore();

        ctx.save();
        let drawPosLeft = left + duration;
        let drawPosTop = currentItemTop + duration;
        ctx.fillStyle = "rgb(255, 255, 255)";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        
        // 计算第一行的底部位置（价格行）
        const priceLineBottom = drawPosTop + priceLineHeight;
        
        // 价格数字 - 最大最突出
        ctx.font = "26px Georgia, WenquanyiZhengHei, Arial, sans-serif";
        ctx.fillStyle = "rgb(255, 255, 255)";
        const priceNumber = `${toReadableNum(item.pricePerUnit)}`;
        const priceNumberMeasure = ctx.measureText(priceNumber);
        const priceNumberWidth = priceNumberMeasure.width;
        const priceNumberHeight = safeGetTextHeight(priceNumberMeasure, 26);
        ctx.fillText(priceNumber, drawPosLeft, priceLineBottom);
        drawPosLeft += priceNumberWidth + duration / 2;
        
        // Gil单位 - 稍小字体，底部对齐
        ctx.font = "18px WenquanyiZhengHei, Georgia, Arial, sans-serif";
        ctx.fillStyle = "rgb(220, 220, 220)";
        const priceUnit = "Gil/个";
        const priceUnitMeasure = ctx.measureText(priceUnit);
        const priceUnitWidth = priceUnitMeasure.width;
        ctx.fillText(priceUnit, drawPosLeft, priceLineBottom);
        drawPosLeft += priceUnitWidth;
        
        // 重置为主要文字颜色，用于后续文字
        ctx.fillStyle = "rgb(255, 255, 255)";
        const itemPerPriceTextHeight = priceNumberHeight;
        if (item.hq) {
            // HQ图标位置需要调整到与文字底部对齐
            ctx.drawImage(hqImage,
                drawPosLeft, priceLineBottom - itemPerPriceTextHeight,
                itemPerPriceTextHeight, itemPerPriceTextHeight);
            drawPosLeft += itemPerPriceTextHeight;
        }
        drawPosLeft += duration;

        // 数量文字 - 中等大小，底部对齐
        ctx.font = "18px WenquanyiZhengHei, Georgia, Arial, sans-serif";
        const itemQuantityText = `${toReadableNum(item.quantity)}个`;
        const itemQuantityTextWidth = ctx.measureText(itemQuantityText).width;
        ctx.fillText(itemQuantityText, drawPosLeft, priceLineBottom);
        drawPosLeft += itemQuantityTextWidth;
        drawPosLeft += duration;

        // 总计文字 - 中等大小，底部对齐
        const itemTotalText = `共计${toReadableNum(item.total)}Gil`;
        const itemTotalTextWidth = ctx.measureText(itemTotalText).width;
        ctx.fillText(itemTotalText, drawPosLeft, priceLineBottom);
        drawPosLeft += itemTotalTextWidth;
        drawPosLeft += duration;

        drawPosLeft = left + duration;
        // 计算第二行的底部位置（服务器信息行）
        const serverLineBottom = priceLineBottom + duration + serverLineHeight;

        // 服务器信息 - 最小字体，灰色显示，底部对齐
        ctx.fillStyle = "rgb(200, 200, 200)"; // 更亮的灰色，在渐变条纹背景上有更好对比度
        ctx.font = "12px WenquanyiZhengHei, Georgia, Arial, sans-serif";
        ctx.fillText(`${item.worldName || ""} | ${item.retainerName} | 信息上传于${toCurrentTimeDifference(new Date(item.lastReviewTime * 1000), true)}（${new Date(item.lastReviewTime * 1000).toLocaleString("zh-CN", { hour12: false })}）`, drawPosLeft, serverLineBottom)

        ctx.restore();
        currentItemTop += dynamicItemHeight + duration;
    }

    return canvas.toBuffer("png");
}
