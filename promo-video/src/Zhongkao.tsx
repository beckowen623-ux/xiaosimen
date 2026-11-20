import React from 'react';
import {AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import boxes from '../public/zk/boxes.json';
import {Background, Badge, Box, Caption, FONT, Phone, fade} from './kit';

const GREEN = '#145843';
const B = boxes as unknown as Record<string, Record<string, Box>>;
export const ZHONGKAO_FRAMES = 990;

const captions = [
  {from: 105, to: 240, step: '第 1 步', title: '每周一卷，一键打印', sub: '英语 / 语文 / 小四门，每周一自动换新'},
  {from: 240, to: 390, step: '第 1 步', title: '孩子在纸上做\n不用一直盯手机', sub: '答案单独一页，带姓名、用时、得分栏'},
  {from: 390, to: 570, step: '第 2 步', title: '做完点出错的题号', sub: '10 秒登记，没点的算做对，错题进错题本'},
  {from: 570, to: 780, step: '第 3 步', title: '错题自动排进复习', sub: '第 1、3、7、14 天提醒，重做到会为止（完整版）'},
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
        孩子同一类题<br /><span style={{color: '#c0392b'}}>错了又错？</span>
      </div>
      <div style={{fontWeight: 500, fontSize: 46, color: '#46554e', marginTop: 48, opacity: b, transform: `translateY(${(1 - b) * 30}px)`}}>
        一张卷子 + 一支笔<br />把错题真正管起来
      </div>
    </AbsoluteFill>
  );
};

const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s0 = 780;
  const lines = ['各地中考原卷 免费看·免费打印', '每个家庭送 1 次整卷打印 + 1 套手机整卷', '完整版 19.9 一次买断'];
  const logo = spring({frame: f - s0, fps, config: {damping: 13}});
  return (
    <AbsoluteFill style={{fontFamily: FONT, alignItems: 'center', paddingTop: 230, opacity: fade(f, s0, s0 + 10)}}>
      <div style={{transform: `scale(${logo})`}}><Badge size={230} /></div>
      <div style={{fontWeight: 900, fontSize: 84, color: '#1c2924', marginTop: 36}}>爱丽克丝中考题库</div>
      <div style={{fontWeight: 500, fontSize: 40, color: '#46554e', marginTop: 10}}>精编模拟卷 · 全国真题 · 可打印</div>
      <div style={{marginTop: 70, display: 'flex', flexDirection: 'column', gap: 26}}>
        {lines.map((t, i) => {
          const p = spring({frame: f - s0 - 18 - i * 12, fps, config: {damping: 15}});
          return (
            <div key={t} style={{background: '#fffefa', border: '3px solid #dedfd6', borderRadius: 28, padding: '24px 40px', fontSize: 44, fontWeight: 900, color: i === 2 ? GREEN : '#1c2924', opacity: p, transform: `translateX(${(1 - p) * 80}px)`}}>
              ✅ {t}
            </div>
          );
        })}
      </div>
      <div style={{marginTop: 80, fontWeight: 900, fontSize: 58, color: '#fff', background: GREEN, padding: '22px 60px', borderRadius: 999, opacity: fade(f, s0 + 60, s0 + 75), transform: `scale(${1 + Math.sin((f - s0) / 8) * 0.02})`}}>
        先免费试 · x4m.cc.cd
      </div>
    </AbsoluteFill>
  );
};

export const Zhongkao: React.FC = () => {
  const f = useCurrentFrame();
  const cap = captions.find(c => f >= c.from && f < c.to);
  const phoneOut = 1 - fade(f, 770, 785);
  return (
    <AbsoluteFill>
      <Background color={GREEN} />
      <Audio src={staticFile('bgm.wav')} volume={(fr) => interpolate(fr, [0, 15, 960, 990], [0, 0.8, 0.8, 0], {extrapolateRight: 'clamp'})} />
      {f < 110 ? <Hook /> : null}
      {cap ? <Caption key={cap.from} start={cap.from} step={cap.step} title={cap.title} sub={cap.sub} color={GREEN} /> : null}
      {f >= 100 && f < 790 ? (
        <div style={{opacity: phoneOut}}>
          <Phone
            enterAt={100}
            shots={[
              {src: 'zk/02-weekly.png', from: 100, scrollTo: 420},
              {src: 'zk/03-print.png', from: 240},
              {src: 'zk/03b-print.png', from: 315},
              {src: 'zk/04-mark.png', from: 390},
              {src: 'zk/05-marked.png', from: 450},
              {src: 'zk/06-saved.png', from: 520, scrollTo: 200},
              {src: 'zk/07-review-hub.png', from: 570, scrollTo: 300},
              {src: 'zk/09-answered.png', from: 665},
            ]}
            highlight={[
              {shot: 'zk/02-weekly.png', box: B['02-weekly'].print, from: 150, to: 240},
              {shot: 'zk/05-marked.png', box: B['05-marked'].grid, from: 458, to: 520},
              {shot: 'zk/06-saved.png', box: B['06-saved'].toast, from: 525, to: 570},
              {shot: 'zk/07-review-hub.png', box: B['07-review-hub'].wrong, from: 600, to: 665},
              {shot: 'zk/09-answered.png', box: B['09-answered'].fb, from: 690, to: 780},
            ]}
          />
        </div>
      ) : null}
      {f >= 775 ? <Cta /> : null}
    </AbsoluteFill>
  );
};
