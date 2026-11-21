import React from 'react';
import {AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import boxes from '../public/kz/boxes.json';
import {Background, Box, Caption, FONT, Phone, fade} from './kit';
import {Img} from 'remotion';

const TEAL = '#0f766e';
const B = boxes as unknown as Record<string, Record<string, Box>>;
export const KAOZHENG_FRAMES = 1275;

// 时间轴：0—110 开场；110—430 早鸟自测；430—550 备考计划；550—960 新考点 + 做一道；960 起结尾
const captions = [
  {from: 110, to: 250, step: '限时免费', title: '早鸟自测水平卷', sub: '初级两科、中级三科 · 题型题量和真实考试一致'},
  {from: 250, to: 330, step: '限时免费', title: '坑点到位，难度对标考试', sub: '60% 算基础过关 · 选一科，一次做完'},
  {from: 330, to: 430, step: '做完就出分', title: '没到 60 分？别慌', sub: '每题写清坑在哪 · 错题按 1、3、7 天自动复习'},
  {from: 430, to: 490, step: '科学刷题', title: '填考试日期，自动排计划', sub: '先测水平 → 按章刷 → 强化 → 整套模拟'},
  {from: 490, to: 550, step: '科学刷题', title: '每天该刷多少题，一目了然', sub: '按题库实际题量算 · 时间不够会提醒'},
  {from: 550, to: 660, step: '2027 新考点', title: '利润表改成五类列报', sub: '初级、中级都要考 · 首页置顶，33 题免费做完'},
  {from: 660, to: 750, step: '2027 新考点', title: '按准则原文逐条整理', sub: '财会〔2026〕11 号 + 答记者问，随大纲更新'},
  {from: 750, to: 820, step: '做一道试试', title: '按老习惯选 A？', sub: '“冲减财务费用”是旧利润表的做法'},
  {from: 820, to: 960, step: '做一道试试', title: '错！新准则归投资类别', sub: '每题写清坑点和依据，做错自动进错题复习'},
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
        初级、中级早鸟自测<br />题型和真实考试一样
      </div>
    </AbsoluteFill>
  );
};


// “题库可以免费拿”：结尾前 3.5 秒
const FreeWay: React.FC<{start: number; color: string}> = ({start, color}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const steps = [
    ['① 先按 14.9 买', '分享价或好友价，都比原价省 5 元'],
    ['② 邀 3 位朋友也来买', '朋友点你的链接，用好友价 14.9 买'],
    ['③ 返现 15 元', '等于白用，还多 1 毛'],
  ];
  const op = fade(f, start, start + 10) * (1 - fade(f, start + 95, start + 105));
  const head = spring({frame: f - start, fps, config: {damping: 13}});
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', paddingTop: 250, opacity: op}}>
      <div style={{fontWeight: 900, fontSize: 100, color: '#b45309', transform: `scale(${0.85 + head * 0.15})`}}>🎁 题库可以免费拿</div>
      <div style={{marginTop: 70, display: 'flex', flexDirection: 'column', gap: 30, width: 900}}>
        {steps.map(([a, b], i) => {
          const p = spring({frame: f - start - 12 - i * 14, fps, config: {damping: 15}});
          return (
            <div key={a} style={{background: '#fffefa', border: '4px solid #f2e5af', borderRadius: 30, padding: '28px 40px', opacity: p, transform: `translateX(${(1 - p) * 90}px)`}}>
              <div style={{fontSize: 56, fontWeight: 900, color: i === 2 ? '#b45309' : '#1c2924'}}>{a}</div>
              <div style={{fontSize: 38, color: '#46554e', marginTop: 8}}>{b}</div>
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 60, fontSize: 42, fontWeight: 900, color, opacity: fade(f, start + 55, start + 70)}}>买完，题库里就有你的专属邀请链接</div>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s0 = 1065;
  const lines = ['有能力：作者在职一年 4 门考试全部一次过', '有方法：自动排计划 → 章节精练 → 模拟卷 → 错题复习', '有诚意：早鸟自测限时免费 · 先试再买'];
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
      <Audio src={staticFile('bgm.wav')} volume={(fr) => interpolate(fr, [0, 15, 1245, 1275], [0, 0.8, 0.8, 0], {extrapolateRight: 'clamp'})} />
      {f < 112 ? <Hook /> : null}
      {cap ? <Caption key={cap.from} start={cap.from} step={cap.step} title={cap.title} sub={cap.sub} color={TEAL} /> : null}
      {f >= 104 && f < 970 ? (
        <div style={{opacity: 1 - fade(f, 950, 965)}}>
          <Phone
            enterAt={104}
            shots={[
              {src: 'kz/k07-selftest.png', from: 104},
              {src: 'kz/k08-papers.png', from: 250},
              {src: 'kz/k09-score.png', from: 330},
              {src: 'kz/k10-plan-entry.png', from: 430},
              {src: 'kz/k11-plan.png', from: 470},
              {src: 'kz/k12-plan-steps.png', from: 510},
              {src: 'kz/k01-home.png', from: 550},
              {src: 'kz/k02-bank.png', from: 660},
              {src: 'kz/k03-question.png', from: 750, scrollTo: 260},
              {src: 'kz/k04-chosen.png', from: 785, scrollTo: 260},
              {src: 'kz/k05-result.png', from: 820, scrollTo: 300},
            ]}
            highlight={[
              {shot: 'kz/k07-selftest.png', box: B['k07-selftest'].card, from: 140, to: 250},
              {shot: 'kz/k08-papers.png', box: B['k08-papers'].grid, from: 262, to: 330},
              {shot: 'kz/k09-score.png', box: B['k09-score'].result, from: 345, to: 430},
              {shot: 'kz/k10-plan-entry.png', box: B['k10-plan-entry'].entry, from: 438, to: 470},
              {shot: 'kz/k11-plan.png', box: B['k11-plan'].form, from: 478, to: 510},
              {shot: 'kz/k12-plan-steps.png', box: B['k12-plan-steps'].status, from: 518, to: 550},
              {shot: 'kz/k01-home.png', box: B['k01-home'].pinned, from: 565, to: 660},
              {shot: 'kz/k02-bank.png', box: B['k02-bank'].notice, from: 672, to: 750},
              {shot: 'kz/k04-chosen.png', box: B['k04-chosen'].choiceA, from: 792, to: 820},
              {shot: 'kz/k05-result.png', box: B['k05-result'].panel, from: 835, to: 950},
            ]}
          />
        </div>
      ) : null}
      {f >= 955 && f < 1070 ? <FreeWay start={960} color={TEAL} /> : null}
      {f >= 1060 ? <Cta /> : null}
    </AbsoluteFill>
  );
};
