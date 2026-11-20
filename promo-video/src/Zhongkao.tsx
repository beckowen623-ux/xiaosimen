import React from 'react';
import {AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import boxes from '../public/zk/boxes.json';
import {Background, Badge, Box, Caption, FONT, Phone, fade} from './kit';

const GREEN = '#145843';
const B = boxes as unknown as Record<string, Record<string, Box>>;
export const ZHONGKAO_FRAMES = 1170;

const captions = [
  {from: 105, to: 255, step: '第 1 步', title: '先测：按学期\n早鸟自测卷', sub: '七上到九下，各科一套，做完出百分制总分'},
  {from: 255, to: 390, step: '第 2 步', title: '哪里弱，按章节补', sub: '每道题标了教材章节，能直接搜“浮力”“二次函数”'},
  {from: 390, to: 510, step: '小升初', title: '语数英按七上章节\n提前衔接', sub: '六年级暑假就能用，限时免费'},
  {from: 510, to: 660, step: '第 3 步', title: '每周一卷，打印纸上做', sub: '做完点出错的题号，10 秒登记进错题本'},
  {from: 660, to: 810, step: '第 4 步', title: '错题自动排进复习', sub: '第 1、3、7、14 天提醒，重做到会为止（完整版）'},
  {from: 810, to: 960, step: '第 5 步', title: '学情分析\n找出最该补的章节', sub: '按科目、章节统计正确率，给出复习建议'},
];

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = spring({frame: f - 4, fps, config: {damping: 14}});
  const b = spring({frame: f - 30, fps, config: {damping: 14}});
  const out = 1 - fade(f, 95, 108);
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out, padding: 70, textAlign: 'center'}}>
      <div style={{fontWeight: 900, fontSize: 104, lineHeight: 1.2, color: '#1c2924', transform: `scale(${0.8 + a * 0.2})`, opacity: a}}>
        孩子哪里弱？<br /><span style={{color: '#c0392b'}}>同一类题错了又错？</span>
      </div>
      <div style={{fontWeight: 500, fontSize: 46, color: '#46554e', marginTop: 48, opacity: b, transform: `translateY(${(1 - b) * 30}px)`}}>
        先测 → 按章节补 → 错题复习到会<br />用科学的刷题方法帮孩子提分
      </div>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s0 = 960;
  const lines = ['早鸟自测卷 · 小升初衔接 限时免费', '各地中考原卷 免费看 · 免费打印', '完整版 19.9 一次买断'];
  const logo = spring({frame: f - s0, fps, config: {damping: 13}});
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', paddingTop: 170, opacity: fade(f, s0, s0 + 10)}}>
      <div style={{transform: `scale(${logo})`}}><Badge size={230} /></div>
      <div style={{fontWeight: 900, fontSize: 84, color: '#1c2924', marginTop: 36}}>爱丽克丝中考题库</div>
      <div style={{fontWeight: 500, fontSize: 40, color: '#46554e', marginTop: 10}}>精编模拟卷 · 全国真题 · 可打印</div>
      <div style={{fontWeight: 900, fontSize: 40, color: GREEN, marginTop: 26, textAlign: 'center', lineHeight: 1.45, opacity: fade(f, s0 + 10, s0 + 22)}}>有能力 · 有决心 · 有诚意<br />用科学的刷题方法帮孩子掌握知识点</div>
      <div style={{marginTop: 50, display: 'flex', flexDirection: 'column', gap: 26}}>
        {lines.map((t, i) => {
          const p = spring({frame: f - s0 - 18 - i * 12, fps, config: {damping: 15}});
          return (
            <div key={t} style={{background: '#fffefa', border: '3px solid #dedfd6', borderRadius: 28, padding: '24px 40px', fontSize: 44, fontWeight: 900, color: i === 2 ? GREEN : '#1c2924', opacity: p, transform: `translateX(${(1 - p) * 80}px)`}}>
              ✅ {t}
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 60, fontWeight: 900, fontSize: 58, color: '#fff', background: GREEN, padding: '22px 60px', borderRadius: 999, opacity: fade(f, s0 + 60, s0 + 75), transform: `scale(${1 + Math.sin((f - s0) / 8) * 0.02})`}}>
        先免费试 · x4m.cc.cd
      </div>
    </AbsoluteFill>
  );
};

export const Zhongkao: React.FC = () => {
  const f = useCurrentFrame();
  const cap = captions.find(c => f >= c.from && f < c.to);
  const phoneOut = 1 - fade(f, 950, 965);
  return (
    <AbsoluteFill>
      <Background color={GREEN} />
      <Audio loop src={staticFile('bgm.wav')} volume={(fr) => interpolate(fr, [0, 15, 1140, 1170], [0, 0.8, 0.8, 0], {extrapolateRight: 'clamp'})} />
      {f < 110 ? <Hook /> : null}
      {cap ? <Caption key={cap.from} start={cap.from} step={cap.step} title={cap.title} sub={cap.sub} color={GREEN} /> : null}
      {f >= 100 && f < 970 ? (
        <div style={{opacity: phoneOut}}>
          <Phone
            enterAt={100}
            shots={[
              {src: 'zk/01-stage.png', from: 100},
              {src: 'zk/02-unit.png', from: 255},
              {src: 'zk/03-xsc.png', from: 390},
              {src: 'zk/04-weekly.png', from: 510},
              {src: 'zk/05-print.png', from: 570},
              {src: 'zk/06-marked.png', from: 610},
              {src: 'zk/08-review-hub.png', from: 660},
              {src: 'zk/09-answered.png', from: 735},
              {src: 'zk/10-analysis.png', from: 810},
            ]}
            highlight={[
              {shot: 'zk/01-stage.png', box: B['01-stage'].chips, from: 125, to: 185},
              {shot: 'zk/01-stage.png', box: B['01-stage'].grid, from: 190, to: 255},
              {shot: 'zk/02-unit.png', box: B['02-unit'].list, from: 275, to: 390},
              {shot: 'zk/03-xsc.png', box: B['03-xsc'].list, from: 410, to: 510},
              {shot: 'zk/04-weekly.png', box: B['04-weekly'].print, from: 525, to: 570},
              {shot: 'zk/06-marked.png', box: B['06-marked'].grid, from: 615, to: 660},
              {shot: 'zk/08-review-hub.png', box: B['08-review-hub'].wrong, from: 680, to: 735},
              {shot: 'zk/09-answered.png', box: B['09-answered'].fb, from: 750, to: 810},
              {shot: 'zk/10-analysis.png', box: B['10-analysis'].out, from: 830, to: 950},
            ]}
          />
        </div>
      ) : null}
      {f >= 955 ? <Cta /> : null}
    </AbsoluteFill>
  );
};
