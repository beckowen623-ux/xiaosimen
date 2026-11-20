import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing} from 'remotion';
import '@fontsource/noto-sans-sc/500.css';
import '@fontsource/noto-sans-sc/900.css';

export const FONT = '"Noto Sans SC", sans-serif';
export const SHOT_W = 780; // 截图宽（2x）
export const SHOT_H = 1328;
export type Box = [number, number, number, number];

export const ease = Easing.bezier(0.33, 1, 0.68, 1);
export const fade = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});

export const Background: React.FC<{color: string}> = ({color}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: '#f6f5ef', overflow: 'hidden'}}>
      <div style={{position: 'absolute', width: 900, height: 900, borderRadius: '50%', background: color, opacity: 0.10, left: -300 + Math.sin(f / 60) * 30, top: -380}} />
      <div style={{position: 'absolute', width: 700, height: 700, borderRadius: '50%', background: '#f2c94c', opacity: 0.13, right: -260, bottom: 120 + Math.cos(f / 70) * 30}} />
    </AbsoluteFill>
  );
};

/** 竖屏顶部字幕：步骤标签 + 大标题 + 副标题，逐条弹入 */
export const Caption: React.FC<{step?: string; title: string; sub?: string; color: string; start: number}> = ({step, title, sub, color, start}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: f - start, fps, config: {damping: 16}});
  return (
    <div style={{position: 'absolute', top: 96, left: 64, right: 64, fontFamily: FONT, transform: `translateY(${(1 - s) * 40}px)`, opacity: s}}>
      {step ? <div style={{display: 'inline-block', background: color, color: '#fff', fontWeight: 900, fontSize: 38, padding: '8px 26px', borderRadius: 999, marginBottom: 22}}>{step}</div> : null}
      <div style={{fontWeight: 900, fontSize: 72, lineHeight: 1.18, color: '#1c2924', letterSpacing: 1, whiteSpace: 'pre-line'}}>{title}</div>
      {sub ? <div style={{fontWeight: 500, fontSize: 40, lineHeight: 1.45, color: '#46554e', marginTop: 16, opacity: fade(f, start + 8, start + 20)}}>{sub}</div> : null}
    </div>
  );
};

export type ShotCue = {src: string; from: number; scrollTo?: number; zoom?: {box: Box; at: number; scale: number}};

/** 手机外框 + 截图序列（交叉淡入），支持滚动和放大到某个框 */
export const Phone: React.FC<{shots: ShotCue[]; highlight?: {box: Box; from: number; to: number; shot: string}[]; enterAt?: number}> = ({shots, highlight = [], enterAt = 0}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const W = 780; // 屏幕显示宽度（px），截图 780 宽正好 1:1
  const H = 1150;
  const enter = spring({frame: f - enterAt, fps, config: {damping: 18}});
  return (
    <div style={{position: 'absolute', left: (1080 - W - 36) / 2, top: 560 + (1 - enter) * 300, opacity: enter, width: W + 36, height: H + 36, borderRadius: 72, background: '#14201b', padding: 18, boxShadow: '0 40px 90px rgba(20,40,30,.28)'}}>
      <div style={{position: 'relative', width: W, height: H, borderRadius: 56, overflow: 'hidden', background: '#fff'}}>
        {shots.map((s, i) => {
          const next = shots[i + 1];
          const op = Math.min(fade(f, s.from, s.from + 8), next ? 1 - fade(f, next.from, next.from + 8) : 1);
          if (op <= 0) return null;
          let ty = 0, sc = 1, ox = W / 2, oy = 0;
          if (s.scrollTo) ty = -s.scrollTo * fade(f, s.from + 6, s.from + 30);
          if (s.zoom) {
            const z = fade(f, s.zoom.at, s.zoom.at + 18);
            sc = 1 + (s.zoom.scale - 1) * z;
            const [x, y, w, h] = s.zoom.box;
            ox = x + w / 2; oy = y + h / 2;
          }
          const hl = highlight.filter(h => h.shot === s.src && f >= h.from && f <= h.to);
          return (
            <div key={s.src + i} style={{position: 'absolute', inset: 0, opacity: op, transform: `translateY(${ty}px) scale(${sc})`, transformOrigin: `${ox}px ${oy}px`}}>
              <Img src={staticFile(s.src)} style={{width: SHOT_W, height: SHOT_H, display: 'block'}} />
              {hl.map((h, k) => {
                const p = fade(f, h.from, h.from + 10);
                const pulse = 1 + Math.sin((f - h.from) / 5) * 0.015;
                const [x, y, w, hh] = h.box;
                return <div key={k} style={{position: 'absolute', left: x - 10, top: y - 10, width: w + 20, height: hh + 20, borderRadius: 26, border: '7px solid #f59e0b', boxShadow: '0 0 0 9999px rgba(0,0,0,.28)', opacity: p, transform: `scale(${pulse})`}} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const Tap: React.FC<{box: Box; at: number}> = ({box, at}) => {
  // 预留：点按涟漪（坐标为截图坐标）
  const f = useCurrentFrame();
  if (f < at || f > at + 20) return null;
  const p = (f - at) / 20;
  return <div style={{position: 'absolute', left: box[0] + box[2] / 2 - 40, top: box[1] + box[3] / 2 - 40, width: 80, height: 80, borderRadius: '50%', background: 'rgba(245,158,11,.5)', transform: `scale(${1 + p})`, opacity: 1 - p}} />;
};

export const Badge: React.FC<{size: number}> = ({size}) => <Img src={staticFile('elx-badge.svg')} style={{width: size, height: size}} />;
