// Canvas 配置和优化设置
export interface CanvasConfig {
  // GPU设置
  enableGPU: boolean;
  msaaLevel: number; // 抗锯齿级别 (2, 4, 8)
  
  // 导出设置
  defaultFormat: 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf';
  defaultQuality: number; // 0-1之间
  defaultDensity: number; // 像素密度
  backgroundColor: string;
  
  // 缓存设置
  enableImageCache: boolean;
  maxCacheSize: number; // 最大缓存图像数量
  
  // 性能设置
  enablePerformanceLogging: boolean;
  batchDrawing: boolean; // 批量绘制优化
  
  // 字体设置
  defaultFontFamily: string;
  enableFontFallback: boolean;
  
  // 存储设置
  saveToLocal: boolean; // 是否保存到本地
}

// 默认配置
export const defaultCanvasConfig: CanvasConfig = {
  enableGPU: true,
  msaaLevel: 4,
  defaultFormat: 'png',
  defaultQuality: 0.95,
  defaultDensity: 1,
  backgroundColor: '#182927',
  enableImageCache: true,
  maxCacheSize: 100,
  enablePerformanceLogging: true,
  batchDrawing: true,
  defaultFontFamily: 'WenquanyiZhengHei,simhei,sans-serif',
  enableFontFallback: true,
  saveToLocal: false
};

// 根据环境调整配置
export function getOptimizedConfig(userConfig?: Partial<CanvasConfig>): CanvasConfig {
  const config = { ...defaultCanvasConfig };
  
  // 应用用户配置
  if (userConfig) {
    Object.assign(config, userConfig);
  }
  
  // 在生产环境中禁用性能日志
  if (process.env.NODE_ENV === 'production') {
    config.enablePerformanceLogging = false;
  }
  
  // 根据可用内存调整缓存大小
  const memoryUsage = process.memoryUsage();
  const memoryGB = memoryUsage.rss / (1024 * 1024 * 1024);
  if (memoryGB < 0.5) {
    config.maxCacheSize = 50;
    config.enableImageCache = false;
  } else if (memoryGB > 2) {
    config.maxCacheSize = 200;
  }
  
  return config;
}

// 导出优化选项生成器
export function getExportOptions(format?: string, customOptions?: any) {
  const config = getOptimizedConfig();
  
  return {
    format: format || config.defaultFormat,
    quality: config.defaultQuality,
    density: config.defaultDensity,
    matte: config.backgroundColor,
    msaa: config.msaaLevel,
    ...customOptions
  };
}

// Canvas初始化选项生成器
export function getCanvasInitOptions(width: number, height: number) {
  const config = getOptimizedConfig();
  
  return {
    width,
    height,
    enableGPU: config.enableGPU,
    msaa: config.msaaLevel
  };
} 
