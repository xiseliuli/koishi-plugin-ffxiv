import * as path from 'path';
export const __root_dir = path.join(__dirname, '../');
import type {} from '@ltxhhz/koishi-plugin-skia-canvas';
import { Context, Schema } from 'koishi';

import * as universalis from './universalis';
import * as item from './item';

export interface Config {
  admin?: string[];
  market?: {
    type: 'text' | 'image';
  };
  canvas?: {
    saveToLocal: boolean;
  };
}

const defaultConfig: Config = {
  market: {
    type: 'image',
  },
  canvas: {
    saveToLocal: false,
  },
};

export const inject = {
  required: ['skia'],
};

export const schema = Schema.object({
  admin: Schema.array(Schema.string()).default([]),
  market: Schema.object({ type: Schema.union(['text', 'image']) }).default({
    type: 'image',
  }),
  canvas: Schema.object({
    saveToLocal: Schema.boolean()
      .default(false)
      .description(
        '是否将生成的图片保存到本地文件。开启时使用文件路径发送，关闭时使用base64直接发送。'
      ),
  }).default({ saveToLocal: false }).disabled,
});

export function apply(ctx: Context, options: Config = {}) {
  options = { ...defaultConfig, ...options };

  ctx.command('ffxiv').alias('ff14');

  ctx.plugin(universalis, { ...options.market, canvas: options.canvas });
  ctx.plugin(item, options.canvas);
}

export const name = 'ffxiv';
