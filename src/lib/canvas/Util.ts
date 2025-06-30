import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

// 绘制性能监控
export class DrawingPerformance {
    private static startTimes = new Map<string, number>();
    
    static start(operation: string) {
        this.startTimes.set(operation, performance.now());
    }
    
    static end(operation: string) {
        const startTime = this.startTimes.get(operation);
        if (startTime) {
            const duration = performance.now() - startTime;
            console.log(`Drawing operation "${operation}" took ${duration.toFixed(2)}ms`);
            this.startTimes.delete(operation);
        }
    }
}

// 文本绘制优化函数
export interface TextDrawOptions {
    font?: string;
    fillStyle?: string;
    textAlign?: CanvasTextAlign;
    textBaseline?: CanvasTextBaseline;
    maxWidth?: number;
    x: number;
    y: number;
}

export function drawText(
    ctx: any,
    text: string,
    options: TextDrawOptions
): { width: number; height: number } {
    ctx.save();
    
    if (options.font) ctx.font = options.font;
    if (options.fillStyle) ctx.fillStyle = options.fillStyle;
    if (options.textAlign) ctx.textAlign = options.textAlign;
    if (options.textBaseline) ctx.textBaseline = options.textBaseline;
    
    const measure = ctx.measureText(text);
    ctx.fillText(text, options.x, options.y, options.maxWidth);
    
    ctx.restore();
    
    // 新的 API 可能不支持 lines 属性，使用基本的高度估算
    const fontSize = parseInt(ctx.font) || 12;
    return {
        width: measure.width,
        height: measure.lines ? measure.lines.map((l: any) => l.height).reduce((a: number, b: number) => a + b, 0) : fontSize
    };
}

// 图像绘制优化函数
export interface ImageDrawOptions {
    x: number;
    y: number;
    width?: number;
    height?: number;
    maintainAspectRatio?: boolean;
}

export function drawImage(
    ctx: any,
    image: any,
    options: ImageDrawOptions
): { width: number; height: number } {
    if (!image) return { width: 0, height: 0 };
    
    let { width, height } = options;
    
    if (options.maintainAspectRatio && (width || height)) {
        const aspectRatio = image.width / image.height;
        if (width && !height) {
            height = width / aspectRatio;
        } else if (height && !width) {
            width = height * aspectRatio;
        }
    }
    
    if (width && height) {
        ctx.drawImage(image, options.x, options.y, width, height);
        return { width, height };
    } else {
        ctx.drawImage(image, options.x, options.y);
        return { width: image.width, height: image.height };
    }
}

// 纵向画图例，返回图例区域的实际宽度和高度。
export function drawLegends(
    ctx: any,
    legends: { color: string, name: string }[],
    x: number, y: number,
    legendWidth: number,
    legendHeight?: number,
    duration: number = 4,
    width?: number | undefined): { width: number, height: number } {
    if (!legendHeight) legendHeight = legendWidth;
    if (!width) width = 0;

    let maxTextWidth = 0, areaHeight = 0;
    for (const legend of legends) {
        const textMeasureResult = ctx.measureText(legend.name);
        const textWidth = textMeasureResult.width;
        // 新的 API 可能不支持 lines 属性，使用基本的高度估算
        const fontSize = parseInt(ctx.font) || 12;
        const textHeight = textMeasureResult.lines ? textMeasureResult.lines.map((l: any) => l.height).reduce((p: number, c: number) => p + c) : fontSize;
        if (textWidth > maxTextWidth) maxTextWidth = textWidth;
        ctx.save();
        ctx.fillStyle = legend.color;
        ctx.fillRect(x, y + areaHeight, legendWidth, legendHeight);
        ctx.restore();

        ctx.save();
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(legend.name, x + legendWidth + duration, y + areaHeight + legendHeight / 2, textWidth);
        ctx.restore();

        areaHeight += Math.max(textHeight, legendHeight) + duration;
    }

    return {
        width: legendWidth + duration + maxTextWidth,
        height: areaHeight - duration // 由于固定区域高度增加一个duration，所以此处减去最后一个duration得到区域实际高度
    }
}

// 批量绘制优化
export class BatchDrawer {
    private operations: (() => void)[] = [];
    
    addOperation(operation: () => void) {
        this.operations.push(operation);
    }
    
    execute(ctx: any) {
        DrawingPerformance.start('batch-draw');
        ctx.save();
        
        for (const operation of this.operations) {
            operation();
        }
        
        ctx.restore();
        this.operations = []; // 清空操作队列
        DrawingPerformance.end('batch-draw');
    }
}

// 背景绘制通用函数
export function drawBackground(
    ctx: any,
    width: number,
    height: number,
    color: string = '#182927'
) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

// 图片存储管理
export class ImageStorage {
    private static outputDir = path.join(process.cwd(), 'temp', 'images');
    private static maxFiles = 100; // 最大缓存文件数
    private static maxAge = 24 * 60 * 60 * 1000; // 24小时过期

    // 确保输出目录存在
    static async ensureOutputDir() {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create output directory:', error);
        }
    }

    // 生成图片文件名（基于内容哈希）
    static generateFileName(data: Buffer, format: string = 'png'): string {
        const hash = crypto.createHash('md5').update(data).digest('hex');
        return `${hash}.${format}`;
    }

    // 保存图片到本地
    static async saveImage(data: Buffer, format: string = 'png'): Promise<string | null> {
        try {
            // 设置超时保护（10秒）
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Image save timeout')), 10000);
            });
            
            const savePromise = this._saveImageInternal(data, format);
            return await Promise.race([savePromise, timeoutPromise]) as string | null;
        } catch (error) {
            console.error('Failed to save image:', error);
            return null;
        }
    }
    
    // 内部保存方法
    private static async _saveImageInternal(data: Buffer, format: string): Promise<string | null> {
        try {
            await this.ensureOutputDir();
            
            const fileName = this.generateFileName(data, format);
            const filePath = path.join(this.outputDir, fileName);
            
            // 检查文件是否已存在
            try {
                await fs.access(filePath);
                console.log(`Image already exists: ${fileName}`);
                return filePath;
            } catch {
                // 文件不存在，继续保存
            }
            
            await fs.writeFile(filePath, data);
            
            // 验证文件是否真正写入成功
            try {
                const stats = await fs.stat(filePath);
                if (stats.size !== data.length) {
                    throw new Error(`File size mismatch: expected ${data.length}, got ${stats.size}`);
                }
                console.log(`Image saved and verified: ${fileName} (${stats.size} bytes)`);
            } catch (verifyError) {
                console.error(`Failed to verify saved image: ${fileName}`, verifyError);
                throw verifyError;
            }
            
            // 清理旧文件（异步执行，不阻塞主流程）
            this.cleanupOldFiles().catch(error => {
                console.warn('Failed to cleanup old files:', error);
            });
            
            return filePath;
        } catch (error) {
            console.error('Failed to save image internally:', error);
            return null;
        }
    }

    // 清理旧文件
    static async cleanupOldFiles() {
        try {
            const files = await fs.readdir(this.outputDir);
            const imageFiles = files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
            
            if (imageFiles.length <= this.maxFiles) return;
            
            // 获取文件信息并按修改时间排序
            const fileStats = await Promise.all(
                imageFiles.map(async (file) => {
                    const filePath = path.join(this.outputDir, file);
                    const stats = await fs.stat(filePath);
                    return { file, filePath, mtime: stats.mtime };
                })
            );
            
            fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
            
            // 删除过期或超出数量限制的文件
            const now = Date.now();
            const filesToDelete = fileStats.filter((fileInfo, index) => {
                const isOld = now - fileInfo.mtime.getTime() > this.maxAge;
                const isExcess = index < fileStats.length - this.maxFiles;
                return isOld || isExcess;
            });
            
            for (const fileInfo of filesToDelete) {
                try {
                    await fs.unlink(fileInfo.filePath);
                    console.log(`Cleaned up old image: ${fileInfo.file}`);
                } catch (error) {
                    console.warn(`Failed to delete old image: ${fileInfo.file}`, error);
                }
            }
        } catch (error) {
            console.warn('Failed to cleanup old images:', error);
        }
    }

    // 获取相对路径（用于消息引用）
    static getRelativePath(filePath: string): string {
        return path.relative(process.cwd(), filePath);
    }

    // 获取文件URL（如果有Web服务器）
    static getFileUrl(filePath: string, baseUrl?: string): string {
        const relativePath = this.getRelativePath(filePath);
        if (baseUrl) {
            return `${baseUrl}/${relativePath.replace(/\\/g, '/')}`;
        }
        return `file://${filePath}`;
    }
}

// 通用的Canvas结果处理
export interface CanvasResult {
    buffer: Buffer;
    filePath?: string;
}

// 处理Canvas绘制结果，生成消息段
export async function processCanvasResult(
    buffer: Buffer, 
    format: string = 'png',
    saveToLocal: boolean = false
): Promise<CanvasResult> {
    // 只有当配置开启时才保存图片到本地
    const filePath = saveToLocal ? await ImageStorage.saveImage(buffer, format) : null;
    
    return {
        buffer,
        filePath: filePath || undefined
    };
}

// 生成图片消息段（优先使用本地文件）
export function createImageSegment(result: CanvasResult) {
    if (result.filePath) {
        console.log(`Using local image file: ${result.filePath}`);
        return { url: `file://${result.filePath}` };
    } else {
        console.log("Fallback to base64 image");
        return { url: "data:image/png;base64," + result.buffer.toString("base64") };
    }
}

// 验证并生成安全的图片消息段
export async function createSafeImageSegment(result: CanvasResult, saveToLocal: boolean = false) {
    // 如果使用本地文件，需要验证文件确实存在
    if (result.filePath && saveToLocal) {
        try {
            await fs.access(result.filePath);
            // 额外验证：检查文件大小是否合理
            const stats = await fs.stat(result.filePath);
            if (stats.size === 0) {
                throw new Error('File is empty');
            }
            console.log(`Image file confirmed: ${result.filePath} (${stats.size} bytes)`);
            return { url: `file://${result.filePath}` };
        } catch (error) {
            console.warn(`File verification failed, falling back to base64: ${result.filePath}`, error);
            return { url: "data:image/png;base64," + result.buffer.toString("base64") };
        }
    } else {
        // 直接使用base64
        console.log("Using base64 image (local storage disabled)");
        return { url: "data:image/png;base64," + result.buffer.toString("base64") };
    }
}

// 简化版本：直接从Buffer生成消息段，确保图片完全生成
export async function bufferToImageSegment(buffer: Buffer, format: string = 'png', saveToLocal: boolean = false) {
    const result = await processCanvasResult(buffer, format, saveToLocal);
    return await createSafeImageSegment(result, saveToLocal);
}

// Canvas系统健康检查
export async function canvasHealthCheck(koishiCtx: any): Promise<{ status: 'ok' | 'warning' | 'error'; message: string }> {
    try {
        // 检查目录权限
        await ImageStorage.ensureOutputDir();
        console.log('Canvas system: Output directory accessible');
        
        // 创建一个小的测试图片
        const { Canvas } = koishiCtx.skia;
        const testCanvas = new Canvas(100, 50);
        const testCtx = testCanvas.getContext('2d');
        testCtx.fillStyle = '#FF0000';
        testCtx.fillRect(0, 0, 100, 50);
        
        const testBuffer = await testCanvas.toBuffer('png');
        if (testBuffer.length > 0) {
            console.log('Canvas system: Image generation working');
            return { status: 'ok', message: 'Canvas system is healthy' };
        } else {
            return { status: 'error', message: 'Canvas system: Failed to generate test image' };
        }
    } catch (error) {
        console.error('Canvas health check failed:', error);
        return { status: 'error', message: `Canvas system error: ${error.message}` };
    }
}
