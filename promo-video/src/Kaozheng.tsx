import React from 'react';
import {AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import boxes from '../public/kz/boxes.json';
import {Background, Box, Caption, FONT, Phone, fade} from './kit';
import {Img} from 'remotion';

const TEAL = '#0f766e';
const B = boxes as unknown as Record<string, Record<string, Box>>;
export const KAOZHENG_FRAMES = 1050;

// 时间轴：0—110 开场；110—430 早鸟自测；430—840 新考点 + 做一道；840 起结尾
const captions = [
  {from: 110, to: 250, step: '限时免费', title: '早鸟自测水平卷', sub: '初级两科、中级三科 · 每科 100 分'},
  {from: 250, to: 330, step: '限时免费', title: '坑点到位，难度对标考试', sub: '60 分算基础过关 · 选一科，一次做完'},
  {from: 330, to: 430, step: '做完就出分', title: '没到 60 分？别慌', sub: '每题写清坑在哪 · 错题按 1、3、7 天自动复习'},
  {from: 430, to: 540, step: '2027 新考点', title: '利润表改成五类列报', sub: '初级、中级都要考 · 首页置顶，33 题免费做完'},
  {from: 540, to: 630, step: '2027 新考点', title: '按准则原文逐条整理', sub: '财会〔2026〕11 号 + 答记者问，随大纲更新'},
  {from: 630, to: 700, step: '做一道试试', title: '按老习惯选 A？', sub: '“冲减财务费用”是旧利润表的做法'},
  {from: 700, to: 840, step: '做一道试试', title: '错！新准则归投资类别', sub: '每题写清坑点和依据，做错自动进错题复习'},
];

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = spring({frame: f - 4, fps, config: {damping: 14}});
  const b = spring({frame: f - 32, fps, config: {damping: 14}});
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: 1 - fade(f, 96, 110), padding: 70, textAlign: 'center'}}>
      <div style={{fontWeight: 900, fontSize: 92, lineHeight: 1.25, color: '#1c2924', transform: `scale(${0.8 + a * 0.2})`, opacity: a}}>
        2027 会计考试<br />你现在能考<span style={{color: '#be123c'}}>几分</span>？
      </div>
      <div style={{fontWeight: 500, fontSize: 46, color: '#46554e', marginTop: 48, opacity: b, transform: `translateY(${(1 - b) * 30}px)`}}>
        初级、中级早鸟自测<br />坑点到位，60 分算过关
      </div>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s0 = 840;
  const lines = ['有能力：作者在职一年 4 门考试全部一次过', '有方法：考点卡 → 章节精练 → 模拟卷 → 错题复习', '有诚意：早鸟自测限时免费 · 先试再买'];
  const logo = spring({frame: f - s0, fps, config: {damping: 13}});
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', paddingTop: 230, opacity: fade(f, s0, s0 + 10)}}>
      <div style={{transform: `scale(${logo})`}}><Img src={staticFile('elx-badge-kaozheng.svg')} style={{width: 230, height: 230}} /></div>
      <div style={{fontWeight: 900, fontSize: 84, color: '#1c2924', marginTop: 36}}>爱丽克丝考证题库</div>
      <div style={{fontWeight: 500, fontSize: 40, color: '#46554e', marginTop: 10}}>初级 · 中级会计 · 中级审计 · 税务师 · 软考</div>
      <div style={{marginTop: 70, display: 'flex', flexDirection: 'column', gap: 26}}>
        {lines.map((t, i) => {
          const p = spring({frame: f - s0 - 18 - i * 12, fps, config: {damping: 15}});
          return (
            <div key={t} style={{background: '#fffefa', border: '3px solid #dce5e2', borderRadius: 28, padding: '22px 34px', fontSize: 36, fontWeight: 900, color: i === 2 ? TEAL : '#1c2924', opacity: p, transform: `translateX(${(1 - p) * 80}px)`}}>
              ✅ {t}
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 80, fontWeight: 900, fontSize: 58, color: '#fff', background: TEAL, padding: '22px 60px', borderRadius: 999, opacity: fade(f, s0 + 60, s0 + 75), transform: `scale(${1 + Math.sin((f - s0) / 8) * 0.02})`}}>
        先免费测 · tinawin.cc.cd
      </div>
    </AbsoluteFill>
  );
};

export const Kaozheng: React.FC = () => {
  const f = useCurrentFrame();
  const cap = captions.find(c => f >= c.from && f < c.to);
  return (
    <AbsoluteFill>
      <Background color={TEAL} />
      <Audio src={staticFile('bgm.wav')} volume={(fr) => interpolate(fr, [0, 15, 1020, 1050], [0, 0.8, 0.8, 0], {extrapolateRight: 'clamp'})} />
      {f < 112 ? <Hook /> : null}
      {cap ? <Caption key={cap.from} start={cap.from} step={cap.step} title={cap.title} sub={cap.sub} color={TEAL} /> : null}
      {f >= 104 && f < 850 ? (
        <div style={{opacity: 1 - fade(f, 830, 845)}}>
          <Phone
            enterAt={104}
            shots={[
              {src: 'kz/k07-selftest.png', from: 104},
              {src: 'kz/k08-papers.png', from: 250},
              {src: 'kz/k09-score.png', from: 330},
              {src: 'kz/k01-home.png', from: 430},
              {src: 'kz/k02-bank.png', from: 540},
              {src: 'kz/k03-question.png', from: 630, scrollTo: 260},
              {src: 'kz/k04-chosen.png', from: 665, scrollTo: 260},
              {src: 'kz/k05-result.png', from: 700, scrollTo: 300},
            ]}
            highlight={[
              {shot: 'kz/k07-selftest.png', box: B['k07-selftest'].card, from: 140, to: 250},
              {shot: 'kz/k08-papers.png', box: B['k08-papers'].grid, from: 262, to: 330},
              {shot: 'kz/k09-score.png', box: B['k09-score'].result, from: 345, to: 430},
              {shot: 'kz/k01-home.png', box: B['k01-home'].pinned, from: 445, to: 540},
              {shot: 'kz/k02-bank.png', box: B['k02-bank'].notice, from: 552, to: 630},
              {shot: 'kz/k04-chosen.png', box: B['k04-chosen'].choiceA, from: 672, to: 700},
              {shot: 'kz/k05-result.png', box: B['k05-result'].panel, from: 715, to: 830},
            ]}
          />
        </div>
      ) : null}
      {f >= 835 ? <Cta /> : null}
    </AbsoluteFill>
  );
};
